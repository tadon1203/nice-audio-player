import {
  UPCOMING_WINDOW,
  type CurrentPlayback,
  type AlbumId,
  type AudioOutputSelection,
  type PlaybackContext,
  type PlaybackFailureCode,
  type PlaybackId,
  type QueueItem,
  type PlaybackPosition,
  type QueueState,
  type RepeatMode,
  type PlayerState,
  type QueueWindow,
  type PlaybackWaveform,
  type QueueItemId,
  type TrackId,
} from "#lib/native/bindings";
import type { player } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import type { PlaybackClock } from "./playback-clock.svelte";
import { PlaybackSnapshots } from "./playback-snapshots";

export type TransitionDirection = "forward" | "backward";

/** A seek sent and not yet shown: the position asked for, and the session and seek count it began from. */
interface PendingSeek {
  positionMs: number;
  playbackId: PlaybackId | null;
  seekCount: number;
}

/** The upcoming chunks read so far, for the queue version they were cut from. */
interface UpcomingLoaded {
  version: number | null;
  chunks: ReadonlyMap<number, QueueItem[]>;
}

/** A failed chunk read is tried this many times in all. */
const UPCOMING_MAX_ATTEMPTS = 3;
const UPCOMING_RETRY_DELAY_MS = 1000;

/** How close the pushed volume must be to the one set for the preview to clear (the backend holds f32). */
const VOLUME_TOLERANCE = 1e-4;

/**
 * Which way a new session's start moves the Now Playing transition. The backend says why the
 * session started: only Previous goes backward; every other start, or none, goes forward.
 */
function directionOf(session: CurrentPlayback | null): TransitionDirection {
  return session?.startedBy === "previous" ? "backward" : "forward";
}

/**
 * Mirrors the backend's Player state. The backend pushes each state whole when it changes, and
 * each push replaces the held value. A command answers only whether the backend accepted it, so its
 * effect shows when the pushed state arrives. Position never lands here: position events feed the
 * clock and the pending seek, and `item` keeps its identity while the same queue item plays.
 */
export class Player {
  readonly #player: typeof player;
  readonly #clock: PlaybackClock;

  #snapshot = $state.raw<PlayerState | null>(null);
  #queue = $state.raw<QueueState | null>(null);
  #waveform = $state.raw<PlaybackWaveform | null>(null);

  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  #item = $state.raw<QueueItem | null>(null);
  /** How the current item was reached: Next/Previous, or anything else (counts as forward). */
  #transitionDirection = $state.raw<TransitionDirection>("forward");
  #pendingSeek = $state.raw<PendingSeek | null>(null);
  #volumePreview = $state.raw<number | null>(null);

  /** The upcoming chunks read beyond the queue state; they belong to one queue version. */
  #upcomingLoaded = $state.raw<UpcomingLoaded>({ version: null, chunks: new Map() });
  readonly #upcomingInFlight = new Set<string>();
  readonly #upcomingAttempts = new Map<string, number>();

  public constructor(playerCommands: typeof player, clock: PlaybackClock) {
    this.#player = playerCommands;
    this.#clock = clock;
  }

  /** The latest Player state the backend pushed, or null before the first one. */
  public get snapshot(): PlayerState | null {
    return this.#snapshot;
  }

  /** The latest queue state the backend pushed, or null before the first one. */
  public get queue(): QueueState | null {
    return this.#queue;
  }

  /** The version of the held queue; a queue window is cut from this version. */
  public get queueVersion(): number | null {
    return this.#queue?.version ?? null;
  }

  /** The clock that follows this playback's position. */
  public get clock(): PlaybackClock {
    return this.#clock;
  }

  /** The loaded track, or the last one that played. A track that is loading shows at once. */
  public get item(): QueueItem | null {
    return this.#item;
  }

  public get status(): PlayerState["status"] {
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
    const held = this.#waveform;
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

  /** The volume the listener set, until the backend reports it; otherwise the backend's. */
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

  /** True while the album's track is loaded and playing or paused. */
  public isAlbumLoaded(albumId: AlbumId): boolean {
    return this.isActive && this.#item?.album?.id === albumId;
  }

  /** The position a seek asked for, until the backend shows a seek past it or another track. */
  public pendingSeekMs(): number | null {
    return this.#pendingSeek?.positionMs ?? null;
  }

  /** Replaces the held Player state with the one the backend pushed. */
  public acceptPlayback(state: PlayerState): void {
    const previousPlaybackId = this.playbackId;
    const item = PlaybackSnapshots.item(state);
    const session = PlaybackSnapshots.session(state);
    this.#snapshot = state;
    if (item?.queueItemId !== this.#item?.queueItemId) {
      this.#item = item;
      this.#transitionDirection = "forward";
    }
    if (session !== null && session.playbackId !== previousPlaybackId) {
      this.#transitionDirection = directionOf(session);
    }
    this.#settlePendingSeek(session);
    if (
      this.#volumePreview !== null &&
      Math.abs(state.base.volume - this.#volumePreview) < VOLUME_TOLERANCE
    ) {
      this.#volumePreview = null;
    }
    this.#clock.accept(PlaybackSnapshots.clockReport(state));
  }

  /** Replaces the held queue with the one the backend pushed. */
  public acceptQueue(state: QueueState): void {
    this.#queue = state;
  }

  /** Replaces the held Waveform with the one the backend pushed. */
  public acceptWaveform(waveform: PlaybackWaveform | null): void {
    this.#waveform = waveform;
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
  public start(context: PlaybackContext, startTrackId: TrackId | null): Promise<Result<null>> {
    return this.#player.play(context, startTrackId);
  }

  public pause(): Promise<Result<null>> {
    return this.#player.pause();
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  public resume(): Promise<Result<null>> {
    return this.#player.resume();
  }

  /** Plays the album from its first track if it is not loaded; otherwise pauses or resumes it. */
  public togglePlayAlbum(albumId: AlbumId): Promise<Result<null>> {
    return this.#toggleAlbum(this.isAlbumLoaded(albumId), { kind: "album", albumId });
  }

  #toggleAlbum(loaded: boolean, context: PlaybackContext): Promise<Result<null>> {
    if (!loaded) return this.start(context, null);
    return this.isPlaying ? this.pause() : this.resume();
  }

  public previous(): Promise<Result<null>> {
    return this.#player.previous();
  }

  public next(): Promise<Result<null>> {
    return this.#player.next();
  }

  /** Seeks to `positionMs`, which the backend clamps to the duration. The position shows at once. */
  public async seek(positionMs: number): Promise<Result<null>> {
    // The one place every seek passes: the backend takes whole, non-negative milliseconds.
    const target = Math.max(Math.round(positionMs), 0);
    const session = this.#session();
    this.#pendingSeek = {
      positionMs: target,
      playbackId: session?.playbackId ?? null,
      seekCount: session?.seekCount ?? 0,
    };
    const result = await this.#player.seek(target);
    // A refused seek never happens, so its position must not keep showing.
    if (!result.ok) this.#pendingSeek = null;
    return result;
  }

  /** Sets the volume, shown at once until the backend reports it. */
  public async setVolume(value: number): Promise<Result<null>> {
    const volume = Math.max(0, Math.min(1, value));
    this.#volumePreview = volume;
    const result = await this.#player.setVolume(volume);
    // A refused volume is not set, so the preview must not keep showing it.
    if (!result.ok) this.#volumePreview = null;
    return result;
  }

  /** Sets the volume; changing it while muted unmutes, so the change is audible. */
  public async changeVolume(value: number): Promise<Result<null>> {
    const pending = [this.setVolume(value)];
    if (this.muted) pending.push(this.toggleMute());
    const results = await Promise.all(pending);
    return results.find((result) => !result.ok) ?? { ok: true, value: null };
  }

  public toggleMute(): Promise<Result<null>> {
    return this.#player.setMuted(!this.muted);
  }

  public setShuffle(enabled: boolean): Promise<Result<null>> {
    return this.#player.setShuffle(enabled);
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  public async shuffleAndStart(context: PlaybackContext): Promise<Result<null>> {
    const shuffle = await this.setShuffle(true);
    if (!shuffle.ok) return shuffle;
    return this.start(context, null);
  }

  public setRepeatMode(mode: RepeatMode): Promise<Result<null>> {
    return this.#player.setRepeatMode(mode);
  }

  public playerRemoveQueueItem(id: QueueItemId): Promise<Result<null>> {
    return this.#player.removeQueueItem(id);
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  public playerMoveQueueItem(id: QueueItemId, to: number): Promise<Result<null>> {
    return this.#player.moveQueueItem(id, to);
  }

  /** The value is true when upcoming items were removed (the caller offers an undo). */
  public async playerClearQueue(): Promise<Result<boolean>> {
    const hadUpcoming = (this.queue?.upcomingCount ?? 0) > 0;
    const result = await this.#player.clearQueue();
    if (!result.ok) return result;
    return { ok: true, value: hadUpcoming };
  }

  /** Puts back the queue the last replacement or "Clear upcoming" took away. */
  public undoQueueChange(): Promise<Result<null>> {
    return this.#player.restorePreviousQueue();
  }

  /** Jumps to an upcoming item and plays it. */
  public playerPlayQueueItem(id: QueueItemId): Promise<Result<null>> {
    return this.#player.playQueueItem(id);
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  public playerEnqueueTrack(trackId: TrackId, next: boolean): Promise<Result<null>> {
    return this.#player.enqueueTrack(trackId, next);
  }

  /** A loaded track restarts on the new device at the same position. */
  public setOutputSelection(selection: AudioOutputSelection): Promise<Result<null>> {
    return this.#player.setOutputSelection(selection);
  }

  /** A slice of the upcoming list beyond what the queue state carries. */
  public fetchQueueWindow(offset: number, limit: number): Promise<Result<QueueWindow>> {
    return this.#player.queueWindow(offset, limit);
  }

  /** The upcoming item at `index`, or undefined while it has not arrived. */
  public upcomingAt(index: number): QueueItem | undefined {
    const prefix = this.#queue?.upcoming ?? [];
    if (index < prefix.length) return prefix[index];
    if (this.#upcomingLoaded.version !== this.queueVersion) return undefined;
    const chunk = this.#upcomingLoaded.chunks.get(Math.floor(index / UPCOMING_WINDOW));
    return chunk?.[index % UPCOMING_WINDOW];
  }

  /**
   * Reads the upcoming chunks around `range` (the rows on screen) that the queue state does not
   * carry. Call during component initialization: it owns an `$effect`.
   */
  public followUpcoming(range: () => { start: number; end: number } | null): void {
    $effect(() => {
      const queue = this.#queue;
      const version = this.queueVersion;
      const visible = range();
      if (queue === null || version === null || visible === null) return;
      const total = queue.upcomingCount;
      const { start, end } = visible;
      const first = Math.max(start, queue.upcoming.length);
      for (
        let chunk = Math.floor(first / UPCOMING_WINDOW);
        chunk * UPCOMING_WINDOW < total && chunk * UPCOMING_WINDOW <= end;
      ) {
        this.#fetchUpcomingChunk(chunk, version);
        chunk += 1;
      }
    });
  }

  #fetchUpcomingChunk(chunk: number, version: number): void {
    const key = `${version}:${chunk}`;
    const have = this.#upcomingLoaded.version === version && this.#upcomingLoaded.chunks.has(chunk);
    if (have || this.#upcomingInFlight.has(key)) return;
    this.#upcomingInFlight.add(key);
    void this.fetchQueueWindow(chunk * UPCOMING_WINDOW, UPCOMING_WINDOW)
      .then((outcome) => {
        if (!outcome.ok) {
          this.#retryUpcomingLater(chunk, version, key);
          return;
        }
        const window = outcome.value;
        this.#upcomingAttempts.delete(key);
        const sameVersion = this.#upcomingLoaded.version === window.version;
        const chunks = new Map(sameVersion ? this.#upcomingLoaded.chunks : []);
        chunks.set(Math.floor(window.offset / UPCOMING_WINDOW), window.items);
        this.#upcomingLoaded = { version: window.version, chunks };
      })
      // The adapter never rejects. A rejection is retried like a failed read, to be safe.
      .catch(() => this.#retryUpcomingLater(chunk, version, key))
      .finally(() => this.#upcomingInFlight.delete(key));
  }

  /** Tries a failed chunk again after a delay, while the queue is still the same version. */
  #retryUpcomingLater(chunk: number, version: number, key: string): void {
    const attempts = (this.#upcomingAttempts.get(key) ?? 0) + 1;
    this.#upcomingAttempts.set(key, attempts);
    if (attempts >= UPCOMING_MAX_ATTEMPTS) return;
    setTimeout(() => {
      if (this.queueVersion === version) this.#fetchUpcomingChunk(chunk, version);
    }, UPCOMING_RETRY_DELAY_MS);
  }

  #session(): CurrentPlayback | null {
    return PlaybackSnapshots.session(this.snapshot);
  }

  /**
   * Clears the pending seek once the backend shows the seek or another playback: a session that is
   * not the seek's, a later seek count, or no session at all (neither playing nor paused).
   */
  #settlePendingSeek(session: CurrentPlayback | null): void {
    const pending = this.#pendingSeek;
    if (pending === null) return;
    const settled =
      session === null ||
      session.playbackId !== pending.playbackId ||
      session.seekCount > pending.seekCount;
    if (settled) this.#pendingSeek = null;
  }
}
