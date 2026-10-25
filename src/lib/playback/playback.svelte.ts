import type {
  CurrentPlayback,
  AlbumId,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackFailureCode,
  PlaybackId,
  QueueItem,
  PlaybackPosition,
  QueueState,
  RepeatMode,
  PlaybackState,
  QueueWindow,
  PlaybackWaveform,
  QueueItemId,
  TrackId,
  Versioned,
} from "#lib/native/bindings";
import { NativeError } from "#lib/native/errors";
import type { player } from "#lib/native/commands";
import { Replica } from "#lib/native/replica.svelte";
import type { PlaybackClock } from "./playback-clock.svelte";
import { PlaybackSnapshots } from "./playback-snapshots";

export type TransitionDirection = "forward" | "backward";
export type TransportCommand =
  | "start"
  | "pause"
  | "resume"
  | "previous"
  | "next"
  | "outputSelection";

interface QueuedTransport {
  command: TransportCommand;
  operation: () => Promise<Versioned<PlaybackState>>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Which way a new session's start moves the Now Playing transition. The backend says why the
 * session started: only Previous goes backward; every other start, or none, goes forward.
 */
function directionOf(session: CurrentPlayback | null): TransitionDirection {
  return session?.startedBy === "previous" ? "backward" : "forward";
}

/**
 * Mirrors the backend's playback state. The replicas hold what the backend said, and every getter
 * reads them. Commands throw their NativeError on failure, and a command a newer one replaced
 * throws a superseded NativeError; the caller decides where that shows (see UserActionRunner). Position never
 * lands here: position events feed the clock and nothing else, and `item` keeps its identity while
 * the same queue item plays.
 */
export class Playback {
  readonly #player: typeof player;
  readonly #clock: PlaybackClock;
  readonly #snapshot = new Replica<PlaybackState>();
  readonly #queue = new Replica<QueueState>();
  readonly #waveform = new Replica<PlaybackWaveform | null>();

  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  #item = $state.raw<QueueItem | null>(null);
  /** How the current item was reached: Next/Previous, or anything else (counts as forward). */
  #transitionDirection = $state.raw<TransitionDirection>("forward");
  #transportPending = $state.raw<TransportCommand | null>(null);
  #seekPending = $state.raw(false);
  #volumePending = $state.raw(false);
  #mutePending = $state.raw(false);
  #volumePreview = $state.raw<number | null>(null);

  #requestedVolume: number | null = null;
  #volumeWriteActive = false;
  #requestedSeek: number | null = null;
  // Latest wins, like the backend: one transport command waits for the one in flight.
  #queuedTransport: QueuedTransport | null = null;

  public constructor(playerCommands: typeof player, clock: PlaybackClock) {
    this.#player = playerCommands;
    this.#clock = clock;
  }

  /** The latest playback snapshot the backend sent, or null before the first one. */
  public get snapshot(): PlaybackState | null {
    return this.#snapshot.value;
  }

  /** The latest queue snapshot the backend sent, or null before the first one. */
  public get queue(): QueueState | null {
    return this.#queue.value;
  }

  /** The version the held queue was published with. */
  public get queueVersion(): number | null {
    return this.#queue.version;
  }

  /** The clock that follows this playback's position. */
  public get clock(): PlaybackClock {
    return this.#clock;
  }

  /** The loaded track, or the last one that played. */
  public get item(): QueueItem | null {
    return this.#item;
  }

  public get status(): PlaybackState["status"] {
    return this.snapshot?.status ?? "stopped";
  }

  /** True while a track is loaded, whether it is playing or paused. */
  public get isActive(): boolean {
    return PlaybackSnapshots.isActive(this.snapshot);
  }

  public get isPlaying(): boolean {
    return this.status === "playing";
  }

  /** Why playback stopped on an output failure, until the listener retries or plays something else. */
  public get failure(): PlaybackFailureCode | null {
    return this.snapshot?.status === "failed" && !this.snapshot.skipping
      ? this.snapshot.error
      : null;
  }

  /** Identifies the loaded session; stable across seeks, new for every track that loads. */
  public get playbackId(): PlaybackId | null {
    return this.#session()?.playbackId ?? null;
  }

  public get durationMs(): number | null {
    return this.#session()?.durationMs ?? null;
  }

  /** The loaded track's Waveform, or null while it is analyzed or it belongs to another playback. */
  public get waveform(): PlaybackWaveform | null {
    const held = this.#waveform.value;
    return held !== null && held.playbackId === this.playbackId ? held : null;
  }

  public get transitionDirection(): TransitionDirection {
    return this.#transitionDirection;
  }

  public get canGoPrevious(): boolean {
    return this.snapshot?.base.canGoPrevious ?? false;
  }

  public get canGoNext(): boolean {
    return this.snapshot?.base.canGoNext ?? false;
  }

  /** The volume the listener set, while it is being written; otherwise the backend's. */
  public get volume(): number {
    return this.#volumePreview ?? this.snapshot?.base.volume ?? 1;
  }

  public get muted(): boolean {
    return this.snapshot?.base.muted ?? false;
  }

  /** The chosen output device, or null for the system default. */
  public get outputDeviceId(): string | null {
    const selection = this.snapshot?.base.outputSelection;
    return selection?.kind === "device" ? selection.deviceId : null;
  }

  public get repeatMode(): RepeatMode {
    return this.queue?.repeatMode ?? "off";
  }

  public get shuffleEnabled(): boolean {
    return this.queue?.shuffleEnabled ?? false;
  }

  /** Which library track is loaded, for highlighting track rows. */
  public get activeTrackId(): TrackId | null {
    return this.#item?.id ?? null;
  }

  public get transportPending(): TransportCommand | null {
    return this.#transportPending;
  }

  public get seekPending(): boolean {
    return this.#seekPending;
  }

  public get volumePending(): boolean {
    return this.#volumePending;
  }

  public get mutePending(): boolean {
    return this.#mutePending;
  }

  /** True while the album's track is loaded and playing or paused. */
  public isAlbumLoaded(albumId: AlbumId): boolean {
    return this.isActive && this.#item?.album?.id === albumId;
  }

  /** The seek waiting for the one in flight, if any: where repeated key presses continue from. */
  public pendingSeekMs(): number | null {
    return this.#requestedSeek;
  }

  /** Keeps the snapshot only if it is newer than the held one. Command responses come here too. */
  public acceptPlayback(incoming: Versioned<PlaybackState>): void {
    const snapshot = incoming.value;
    const incomingItem = PlaybackSnapshots.item(snapshot);
    if (!this.#snapshot.accept(incoming)) return;
    if (incomingItem?.queueItemId !== this.#item?.queueItemId) {
      this.#transitionDirection = directionOf(PlaybackSnapshots.session(snapshot));
      this.#item = incomingItem;
    }
    this.#clock.accept(PlaybackSnapshots.clockReport(snapshot));
  }

  /** Keeps the queue only if it is newer than the held one. Command responses come here too. */
  public acceptQueue(incoming: Versioned<QueueState>): void {
    this.#queue.accept(incoming);
  }

  /** Keeps the Waveform only if it is newer than the held one. Pushed states and the initial state come here. */
  public acceptWaveform(incoming: Versioned<PlaybackWaveform | null>): void {
    this.#waveform.accept(incoming);
  }

  /**
   * Time only: a position for another session or seek than the snapshot's is stale. A paused
   * snapshot already holds the exact position, and a tick sent before the pause must not move it.
   */
  public acceptPosition(position: PlaybackPosition): void {
    const session = this.#session();
    if (session === null || this.status !== "playing") return;
    if (position.playbackId !== session.playbackId) return;
    if (position.seekCount !== session.seekCount) return;
    this.#clock.accept(PlaybackSnapshots.clockReport(this.snapshot, position));
  }

  /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
  public start(context: PlaybackContext, startTrackId: TrackId | null): Promise<void> {
    return this.#runTransport("start", () => this.#player.play(context, startTrackId));
  }

  public pause(): Promise<void> {
    return this.#runTransport("pause", () => this.#player.pause());
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  public resume(): Promise<void> {
    return this.#runTransport("resume", () => this.#player.resume());
  }

  /** Plays the album from its first track if it is not loaded; otherwise pauses or resumes it. */
  public togglePlayAlbum(albumId: AlbumId): Promise<void> {
    return this.#toggleAlbum(this.isAlbumLoaded(albumId), { kind: "album", albumId });
  }

  #toggleAlbum(loaded: boolean, context: PlaybackContext): Promise<void> {
    if (!loaded) return this.start(context, null);
    return this.isPlaying ? this.pause() : this.resume();
  }

  public previous(): Promise<void> {
    return this.#runTransport("previous", () => this.#player.previous());
  }

  public next(): Promise<void> {
    return this.#runTransport("next", () => this.#player.next());
  }

  /**
   * Seeks. Requests made while one is in flight coalesce: only the latest is sent once the
   * first returns, so holding an arrow key keeps moving instead of dropping most presses.
   */
  public async seek(positionMs: number): Promise<void> {
    // The one place every seek passes: the backend takes whole, non-negative milliseconds and
    // clamps them to the duration.
    this.#requestedSeek = Math.max(Math.round(positionMs), 0);
    if (this.#seekPending) return;
    this.#seekPending = true;
    try {
      while (this.#requestedSeek !== null) {
        const value = this.#requestedSeek;
        this.#requestedSeek = null;
        this.acceptPlayback(await this.#player.seek(value));
      }
    } catch (error) {
      this.#requestedSeek = null;
      throw error;
    } finally {
      this.#seekPending = false;
    }
  }

  /** Sets the volume. Requests made while one is being written coalesce, as seeks do. */
  public setVolume(value: number): Promise<void> {
    this.#requestedVolume = Math.max(0, Math.min(1, value));
    this.#volumePreview = this.#requestedVolume;
    return this.#flushVolume();
  }

  /** Sets the volume; changing it while muted unmutes, so the change is audible. */
  public async changeVolume(value: number): Promise<void> {
    const pending = [this.setVolume(value)];
    if (this.muted && !this.mutePending) pending.push(this.toggleMute());
    await Promise.all(pending);
  }

  public async toggleMute(): Promise<void> {
    if (this.#mutePending) return;
    this.#mutePending = true;
    try {
      this.acceptPlayback(await this.#player.setMuted(!this.muted));
    } finally {
      this.#mutePending = false;
    }
  }

  public setShuffle(enabled: boolean): Promise<void> {
    return this.#runQueueCommand(() => this.#player.setShuffle(enabled));
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  public async shuffleAndStart(context: PlaybackContext): Promise<void> {
    await this.setShuffle(true);
    await this.start(context, null);
  }

  public setRepeatMode(mode: RepeatMode): Promise<void> {
    return this.#runQueueCommand(() => this.#player.setRepeatMode(mode));
  }

  public playerRemoveQueueItem(id: QueueItemId): Promise<void> {
    return this.#runQueueCommand(() => this.#player.removeQueueItem(id));
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  public playerMoveQueueItem(id: QueueItemId, to: number): Promise<void> {
    return this.#runQueueCommand(() => this.#player.moveQueueItem(id, to));
  }

  /** Resolves true when upcoming items were removed (the caller offers an undo). */
  public async playerClearQueue(): Promise<boolean> {
    const hadUpcoming = (this.queue?.upcomingCount ?? 0) > 0;
    await this.#runQueueCommand(() => this.#player.clearQueue());
    return hadUpcoming;
  }

  /** Puts back the queue the last replacement or "Clear upcoming" took away. */
  public undoQueueChange(): Promise<void> {
    return this.#runTransport("start", () => this.#player.restorePreviousQueue());
  }

  /** Jumps to an upcoming item and plays it. */
  public playerPlayQueueItem(id: QueueItemId): Promise<void> {
    return this.#runTransport("start", () => this.#player.playQueueItem(id));
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  public playerEnqueueTrack(trackId: TrackId, next: boolean): Promise<void> {
    return this.#runQueueCommand(() => this.#player.enqueueTrack(trackId, next));
  }

  /** A loaded track restarts on the new device at the same position. */
  public setOutputSelection(selection: AudioOutputSelection): Promise<void> {
    return this.#runTransport("outputSelection", () => this.#player.setOutputSelection(selection));
  }

  /** A slice of the upcoming list beyond what the queue snapshot carries. */
  public fetchQueueWindow(offset: number, limit: number): Promise<QueueWindow> {
    return this.#player.queueWindow(offset, limit);
  }

  #session(): CurrentPlayback | null {
    return PlaybackSnapshots.session(this.snapshot);
  }

  /**
   * Runs a transport command. One that arrives while another is in flight waits for it, and a
   * newer one replaces it: the replaced command rejects as superseded, so the latest press wins.
   */
  #runTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackState>>,
  ): Promise<void> {
    if (this.#transportPending === null) {
      return this.#performTransport(command, operation);
    }
    this.#queuedTransport?.reject(new NativeError("player", { code: "superseded" }));
    return new Promise((resolve, reject) => {
      this.#queuedTransport = { command, operation, resolve, reject };
    });
  }

  async #performTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackState>>,
  ): Promise<void> {
    this.#transportPending = command;
    try {
      this.acceptPlayback(await operation());
    } finally {
      this.#transportPending = null;
      const queued = this.#queuedTransport;
      this.#queuedTransport = null;
      if (queued !== null) {
        void this.#performTransport(queued.command, queued.operation).then(
          queued.resolve,
          queued.reject,
        );
      }
    }
  }

  async #runQueueCommand(operation: () => Promise<Versioned<QueueState>>): Promise<void> {
    this.acceptQueue(await operation());
  }

  async #flushVolume(): Promise<void> {
    if (this.#volumeWriteActive) return;
    this.#volumeWriteActive = true;
    this.#volumePending = true;
    try {
      while (this.#requestedVolume !== null) {
        const value = this.#requestedVolume;
        this.#requestedVolume = null;
        this.acceptPlayback(await this.#player.setVolume(value));
      }
      this.#volumePreview = null;
    } catch (error) {
      this.#requestedVolume = null;
      this.#volumePreview = null;
      throw error;
    } finally {
      this.#volumeWriteActive = false;
      this.#volumePending = false;
    }
  }
}
