import type {
  AppEvent,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackItem,
  PlaybackQueueSnapshot,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  TNativeAPI,
} from "$lib/native";
import { nativeErrorCode } from "$lib/native";
import { createPlaybackClock, type PlaybackClock } from "./clock";
import { playbackCommandErrorMessage } from "./playback-errors";
import { clockReportOf, isActivePlayback, snapshotItem, snapshotSession } from "./snapshot";

export type PlaybackNavigation = "next" | "previous";
export type PlaybackConnection = "loading" | "ready" | "failed";
export type TransportCommand =
  | "start"
  | "pause"
  | "resume"
  | "previous"
  | "next"
  | "outputSelection";

const acceptsRevision = (incoming: number | null, current: number | null) =>
  incoming === null ? current === null : current === null || incoming >= current;

const SYSTEM_DEFAULT: AudioOutputSelection = { kind: "systemDefault" };

/**
 * Mirrors the backend's playback state. Raw fields hold what the backend said; everything a
 * component shows is derived from them, so a position tick changes `positionMs` and nothing
 * else, and `item` keeps its identity while the same queue item plays.
 */
export class Playback {
  readonly clock: PlaybackClock;
  readonly #api: TNativeAPI;

  snapshot = $state.raw<PlaybackSnapshot | null>(null);
  queue = $state.raw<PlaybackQueueSnapshot | null>(null);
  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  item = $state.raw<PlaybackItem | null>(null);
  /** How the current item was reached: Next/Previous, or anything else (counts as "next"). */
  lastNavigation = $state.raw<PlaybackNavigation>("next");
  playbackRevision = $state.raw<number | null>(null);
  queueRevision = $state.raw<number | null>(null);
  connection = $state.raw<PlaybackConnection>("loading");
  transportPending = $state.raw<TransportCommand | null>(null);
  seekPending = $state.raw(false);
  volumePending = $state.raw(false);
  mutePending = $state.raw(false);
  volumePreview = $state.raw<number | null>(null);
  error = $state.raw<string | null>(null);

  #initializePromise: Promise<void> | null = null;
  #requestedVolume: number | null = null;
  #volumeWriteActive = false;
  #requestedSeek: number | null = null;
  // Set when Next/Previous is pressed and consumed by the snapshot that changes the item, so
  // the direction and the new item reach subscribers in the same update.
  #pendingNavigation: PlaybackNavigation | null = null;

  readonly #session = $derived(snapshotSession(this.snapshot));
  readonly positionMs = $derived(this.#session?.positionMs ?? 0);
  readonly durationMs = $derived(this.#session?.durationMs ?? null);
  readonly transport = $derived({
    status: this.snapshot?.status ?? ("stopped" as const),
    active: isActivePlayback(this.snapshot),
    canGoPrevious: this.snapshot?.base.canGoPrevious ?? false,
    canGoNext: this.snapshot?.base.canGoNext ?? false,
    connection: this.connection,
    pending: this.transportPending,
    seekPending: this.seekPending,
    commandError: this.error,
  });
  readonly #deviceId = $derived.by(() => {
    const selection = this.snapshot?.base.outputSelection;
    return selection?.kind === "device" ? selection.deviceId : null;
  });
  readonly outputSelection = $derived<AudioOutputSelection>(
    this.#deviceId === null ? SYSTEM_DEFAULT : { kind: "device", deviceId: this.#deviceId },
  );
  readonly output = $derived({
    volume: this.volumePreview ?? this.snapshot?.base.volume ?? 1,
    muted: this.snapshot?.base.muted ?? false,
    mutePending: this.mutePending,
    deviceId: this.#deviceId,
    outputSelection: this.outputSelection,
  });
  readonly repeatMode = $derived<PlaybackRepeatMode>(this.queue?.repeatMode ?? "off");
  readonly shuffleEnabled = $derived(this.queue?.shuffleEnabled ?? false);
  /** Which library track is loaded, for highlighting track rows. */
  readonly activeTrackId = $derived(this.item?.trackId ?? null);
  readonly status = $derived(this.snapshot?.status ?? ("stopped" as const));

  constructor(api: TNativeAPI, clock: PlaybackClock) {
    this.#api = api;
    this.clock = clock;
  }

  #setError(error: unknown) {
    // A request replaced by a newer one has nothing to report.
    if (nativeErrorCode(error) === "superseded") return;
    this.error = error ? playbackCommandErrorMessage(error) : null;
  }

  acceptPlayback(snapshot: PlaybackSnapshot) {
    if (!acceptsRevision(snapshot.base.revision, this.playbackRevision)) return;
    const incoming = snapshotItem(snapshot);
    const itemChanged = incoming?.queueItemId !== this.item?.queueItemId;
    if (itemChanged) {
      this.lastNavigation = this.#pendingNavigation ?? "next";
      this.#pendingNavigation = null;
      this.item = incoming;
    }
    this.snapshot = snapshot;
    this.playbackRevision = snapshot.base.revision;
    this.clock.accept(clockReportOf(snapshot));
  }

  acceptQueue(queue: PlaybackQueueSnapshot) {
    if (!acceptsRevision(queue.revision, this.queueRevision)) return;
    this.queue = queue;
    this.queueRevision = queue.revision;
  }

  acceptEvent(event: AppEvent) {
    if (event.event === "playbackStateChanged") this.acceptPlayback(event.payload);
    if (event.event === "playbackQueueStateChanged") this.acceptQueue(event.payload);
  }

  async #runTransport(
    command: TransportCommand,
    operation: () => Promise<PlaybackSnapshot>,
  ): Promise<boolean> {
    if (this.transportPending !== null) return false;
    this.transportPending = command;
    this.error = null;
    try {
      this.acceptPlayback(await operation());
      return true;
    } catch (error) {
      this.#setError(error);
      return false;
    } finally {
      this.#pendingNavigation = null;
      this.transportPending = null;
    }
  }

  async #runQueueCommand(operation: () => Promise<PlaybackQueueSnapshot>) {
    this.error = null;
    try {
      this.acceptQueue(await operation());
    } catch (error) {
      this.#setError(error);
    }
  }

  async #flushVolume() {
    if (this.#volumeWriteActive) return;
    this.#volumeWriteActive = true;
    this.volumePending = true;
    this.error = null;
    try {
      while (this.#requestedVolume !== null) {
        const value = this.#requestedVolume;
        this.#requestedVolume = null;
        this.acceptPlayback(await this.#api.setPlaybackVolume(value));
      }
      this.volumePreview = null;
    } catch (error) {
      this.#requestedVolume = null;
      this.volumePreview = null;
      this.#setError(error);
    } finally {
      this.#volumeWriteActive = false;
      this.volumePending = false;
    }
  }

  initialize(): Promise<void> {
    if (this.#initializePromise) return this.#initializePromise;
    this.connection = "loading";
    this.error = null;
    this.#initializePromise = (async () => {
      try {
        const [snapshot, queue] = await Promise.all([
          this.#api.getPlaybackState(),
          this.#api.getPlaybackQueue(),
        ]);
        this.acceptPlayback(snapshot);
        this.acceptQueue(queue);
        this.connection = "ready";
      } catch (error) {
        this.connection = "failed";
        this.error = playbackCommandErrorMessage(error);
      }
    })();
    return this.#initializePromise;
  }

  /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
  async startPlayback(context: PlaybackContext, startTrackId: string | null): Promise<void> {
    await this.#runTransport("start", () => this.#api.startPlayback(context, startTrackId));
  }

  /** A slice of the upcoming list beyond what the queue snapshot carries. */
  fetchQueueWindow(offset: number, limit: number) {
    return this.#api.getPlaybackQueueWindow(offset, limit);
  }

  pause() {
    return this.#runTransport("pause", () => this.#api.pausePlayback());
  }

  resume() {
    return this.#runTransport("resume", () => this.#api.resumePlayback());
  }

  previous() {
    this.#pendingNavigation = "previous";
    return this.#runTransport("previous", () => this.#api.previousPlayback());
  }

  next() {
    this.#pendingNavigation = "next";
    return this.#runTransport("next", () => this.#api.nextPlayback());
  }

  /**
   * Seeks. Requests made while one is in flight coalesce: only the latest is sent once the
   * first returns, so holding an arrow key keeps moving instead of dropping most presses.
   */
  async seek(positionMs: number) {
    const duration = this.durationMs;
    this.#requestedSeek =
      duration === null ? positionMs : Math.min(Math.max(positionMs, 0), duration);
    if (this.seekPending) return;
    this.seekPending = true;
    this.error = null;
    try {
      while (this.#requestedSeek !== null) {
        const value = this.#requestedSeek;
        this.#requestedSeek = null;
        this.acceptPlayback(await this.#api.seekPlayback(value));
      }
    } catch (error) {
      this.#requestedSeek = null;
      this.#setError(error);
    } finally {
      this.seekPending = false;
    }
  }

  /** The seek waiting for the one in flight, if any: where repeated key presses continue from. */
  pendingSeekMs() {
    return this.#requestedSeek;
  }

  setVolume(value: number) {
    this.#requestedVolume = Math.max(0, Math.min(1, value));
    this.volumePreview = this.#requestedVolume;
    void this.#flushVolume();
  }

  async toggleMute() {
    if (this.mutePending) return;
    this.mutePending = true;
    this.error = null;
    try {
      const muted = this.snapshot?.base.muted ?? false;
      this.acceptPlayback(await this.#api.setPlaybackMuted(!muted));
    } catch (error) {
      this.#setError(error);
    } finally {
      this.mutePending = false;
    }
  }

  setShuffle(enabled: boolean) {
    return this.#runQueueCommand(() => this.#api.setPlaybackShuffle(enabled));
  }

  setRepeatMode(mode: PlaybackRepeatMode) {
    return this.#runQueueCommand(() => this.#api.setPlaybackRepeatMode(mode));
  }

  removeQueueItem(id: string) {
    return this.#runQueueCommand(() => this.#api.removeQueueItem(id));
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  moveQueueItem(id: string, to: number) {
    return this.#runQueueCommand(() => this.#api.moveQueueItem(id, to));
  }

  clearQueue() {
    return this.#runQueueCommand(() => this.#api.clearQueue());
  }

  /** Jumps to an upcoming item and plays it. */
  playQueueItem(id: string) {
    return this.#runTransport("start", () => this.#api.playQueueItem(id));
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  enqueueTrack(trackId: string, next: boolean) {
    return this.#runQueueCommand(() => this.#api.enqueueTrack(trackId, next));
  }

  /** A loaded track restarts on the new device at the same position. */
  setOutputSelection(selection: AudioOutputSelection) {
    return this.#runTransport("outputSelection", () =>
      this.#api.setAudioOutputSelection(selection),
    );
  }
}

export function createPlayback(api: TNativeAPI, clock = createPlaybackClock()): Playback {
  return new Playback(api, clock);
}
