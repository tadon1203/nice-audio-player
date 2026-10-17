import type {
  ActiveSession,
  AlbumId,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackFailureCode,
  PlaybackId,
  PlaybackItem,
  PlaybackPosition,
  PlaybackQueueSnapshot,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  PlaybackClient,
  PlaybackQueueWindow,
  QueueItemId,
  TrackId,
  Versioned,
} from "#lib/native";
import { Replica, SupersededError } from "#lib/native";
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
  operation: () => Promise<Versioned<PlaybackSnapshot>>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Which way a new session's start moves the Now Playing transition. The backend says why the
 * session started: only Previous goes backward; every other start, or none, goes forward.
 */
function directionOf(session: ActiveSession | null): TransitionDirection {
  return session?.startedBy === "previous" ? "backward" : "forward";
}

/**
 * Mirrors the backend's playback state. The replicas hold what the backend said, and every getter
 * reads them. Commands throw their PlaybackError on failure, and a command a newer one replaced
 * throws SupersededError; the caller decides where that shows (see UserActionRunner). Position never
 * lands here: position events feed the clock and nothing else, and `item` keeps its identity while
 * the same queue item plays.
 */
export class Playback {
  readonly #client: PlaybackClient;
  readonly #clock: PlaybackClock;
  readonly #snapshot = new Replica<PlaybackSnapshot>();
  readonly #queue = new Replica<PlaybackQueueSnapshot>();

  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  #item = $state.raw<PlaybackItem | null>(null);
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

  public constructor(client: PlaybackClient, clock: PlaybackClock) {
    this.#client = client;
    this.#clock = clock;
  }

  /** The latest playback snapshot the backend sent, or null before the first one. */
  public get snapshot(): PlaybackSnapshot | null {
    return this.#snapshot.value;
  }

  /** The latest queue snapshot the backend sent, or null before the first one. */
  public get queue(): PlaybackQueueSnapshot | null {
    return this.#queue.value;
  }

  /** The revision the held queue was published with. */
  public get queueRevision(): number | null {
    return this.#queue.revision;
  }

  /** The clock that follows this playback's position. */
  public get clock(): PlaybackClock {
    return this.#clock;
  }

  /** The loaded track, or the last one that played. */
  public get item(): PlaybackItem | null {
    return this.#item;
  }

  public get status(): PlaybackSnapshot["status"] {
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

  public get repeatMode(): PlaybackRepeatMode {
    return this.queue?.repeatMode ?? "off";
  }

  public get shuffleEnabled(): boolean {
    return this.queue?.shuffleEnabled ?? false;
  }

  /** Which library track is loaded, for highlighting track rows. */
  public get activeTrackId(): TrackId | null {
    return this.#item?.trackId ?? null;
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
  public acceptPlayback(incoming: Versioned<PlaybackSnapshot>): void {
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
  public acceptQueue(incoming: Versioned<PlaybackQueueSnapshot>): void {
    this.#queue.accept(incoming);
  }

  /**
   * Time only: a position for another session or seek than the snapshot's is stale. A paused
   * snapshot already holds the exact position, and a tick sent before the pause must not move it.
   */
  public acceptPosition(position: PlaybackPosition): void {
    const session = this.#session();
    if (session === null || this.status !== "playing") return;
    if (position.playbackId !== session.playbackId) return;
    if (position.seekRevision !== session.seekRevision) return;
    this.#clock.accept(PlaybackSnapshots.clockReport(this.snapshot, position));
  }

  /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
  public start(context: PlaybackContext, startTrackId: TrackId | null): Promise<void> {
    return this.#runTransport("start", () => this.#client.start(context, startTrackId));
  }

  public pause(): Promise<void> {
    return this.#runTransport("pause", () => this.#client.pause());
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  public resume(): Promise<void> {
    return this.#runTransport("resume", () => this.#client.resume());
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
    return this.#runTransport("previous", () => this.#client.previous());
  }

  public next(): Promise<void> {
    return this.#runTransport("next", () => this.#client.next());
  }

  /**
   * Seeks. Requests made while one is in flight coalesce: only the latest is sent once the
   * first returns, so holding an arrow key keeps moving instead of dropping most presses.
   */
  public async seek(positionMs: number): Promise<void> {
    // The one place every seek passes: the backend takes whole milliseconds.
    const rounded = Math.round(positionMs);
    const duration = this.durationMs;
    this.#requestedSeek = duration === null ? rounded : Math.min(Math.max(rounded, 0), duration);
    if (this.#seekPending) return;
    this.#seekPending = true;
    try {
      while (this.#requestedSeek !== null) {
        const value = this.#requestedSeek;
        this.#requestedSeek = null;
        this.acceptPlayback(await this.#client.seek(value));
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
      this.acceptPlayback(await this.#client.setMuted(!this.muted));
    } finally {
      this.#mutePending = false;
    }
  }

  public setShuffle(enabled: boolean): Promise<void> {
    return this.#runQueueCommand(() => this.#client.setShuffle(enabled));
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  public async shuffleAndStart(context: PlaybackContext): Promise<void> {
    await this.setShuffle(true);
    await this.start(context, null);
  }

  public setRepeatMode(mode: PlaybackRepeatMode): Promise<void> {
    return this.#runQueueCommand(() => this.#client.setRepeatMode(mode));
  }

  public removeQueueItem(id: QueueItemId): Promise<void> {
    return this.#runQueueCommand(() => this.#client.removeQueueItem(id));
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  public moveQueueItem(id: QueueItemId, to: number): Promise<void> {
    return this.#runQueueCommand(() => this.#client.moveQueueItem(id, to));
  }

  /** Resolves true when upcoming items were removed (the caller offers an undo). */
  public async clearQueue(): Promise<boolean> {
    const hadUpcoming = (this.queue?.upcomingCount ?? 0) > 0;
    await this.#runQueueCommand(() => this.#client.clearQueue());
    return hadUpcoming;
  }

  /** Puts back the queue the last replacement or "Clear upcoming" took away. */
  public undoQueueChange(): Promise<void> {
    return this.#runTransport("start", () => this.#client.restorePreviousQueue());
  }

  /** Jumps to an upcoming item and plays it. */
  public playQueueItem(id: QueueItemId): Promise<void> {
    return this.#runTransport("start", () => this.#client.playQueueItem(id));
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  public enqueueTrack(trackId: TrackId, next: boolean): Promise<void> {
    return this.#runQueueCommand(() => this.#client.enqueueTrack(trackId, next));
  }

  /** A loaded track restarts on the new device at the same position. */
  public setOutputSelection(selection: AudioOutputSelection): Promise<void> {
    return this.#runTransport("outputSelection", () => this.#client.setOutputSelection(selection));
  }

  /** A slice of the upcoming list beyond what the queue snapshot carries. */
  public fetchQueueWindow(offset: number, limit: number): Promise<PlaybackQueueWindow> {
    return this.#client.queueWindow(offset, limit);
  }

  #session(): ActiveSession | null {
    return PlaybackSnapshots.session(this.snapshot);
  }

  /**
   * Runs a transport command. One that arrives while another is in flight waits for it, and a
   * newer one replaces it: the replaced command rejects with SupersededError, so the latest press wins.
   */
  #runTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackSnapshot>>,
  ): Promise<void> {
    if (this.#transportPending === null) {
      return this.#performTransport(command, operation);
    }
    this.#queuedTransport?.reject(new SupersededError({ code: "superseded" }));
    return new Promise((resolve, reject) => {
      this.#queuedTransport = { command, operation, resolve, reject };
    });
  }

  async #performTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackSnapshot>>,
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

  async #runQueueCommand(
    operation: () => Promise<Versioned<PlaybackQueueSnapshot>>,
  ): Promise<void> {
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
        this.acceptPlayback(await this.#client.setVolume(value));
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
