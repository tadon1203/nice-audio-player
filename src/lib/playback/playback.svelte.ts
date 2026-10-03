import type {
  AppEvent,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackItem,
  PlaybackPosition,
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

/** How long the notice about skipped tracks, or the offer to undo, stays. */
const NOTICE_MS = 6_000;

type QueuedTransport = {
  command: TransportCommand;
  operation: () => Promise<PlaybackSnapshot>;
  navigation: PlaybackNavigation | null;
  settle: (done: boolean) => void;
};

const acceptsRevision = (incoming: number | null, current: number | null) =>
  incoming === null ? current === null : current === null || incoming >= current;

/**
 * Mirrors the backend's playback state. Raw fields hold what the backend said; everything a
 * component shows is a primitive derived from them, so a component re-renders only for the
 * fact it reads. Position never lands here: position events feed the clock and nothing else,
 * and `item` keeps its identity while the same queue item plays.
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
  connection = $state.raw<PlaybackConnection>("loading");
  transportPending = $state.raw<TransportCommand | null>(null);
  seekPending = $state.raw(false);
  volumePending = $state.raw(false);
  mutePending = $state.raw(false);
  volumePreview = $state.raw<number | null>(null);
  error = $state.raw<string | null>(null);
  /** What the player did by itself, e.g. skipped unplayable tracks. Clears after a while. */
  notice = $state.raw<string | null>(null);
  /** A queue change the listener can take back ("Queue replaced"). Clears after a while. */
  undoOffer = $state.raw<string | null>(null);

  #initializePromise: Promise<void> | null = null;
  #requestedVolume: number | null = null;
  #volumeWriteActive = false;
  #requestedSeek: number | null = null;
  // Set when Next/Previous is pressed and consumed by the snapshot that changes the item, so
  // the direction and the new item reach subscribers in the same update.
  #pendingNavigation: PlaybackNavigation | null = null;
  // Latest wins, like the backend: one transport command waits for the one in flight.
  #queuedTransport: QueuedTransport | null = null;
  #skippedTitles: string[] = [];
  #noticeTimer: ReturnType<typeof setTimeout> | null = null;
  #undoTimer: ReturnType<typeof setTimeout> | null = null;

  readonly #session = $derived(snapshotSession(this.snapshot));
  readonly status = $derived(this.snapshot?.status ?? ("stopped" as const));
  /** Why playback stopped, until the listener retries or plays something else. */
  readonly failure = $derived(
    this.snapshot?.status === "failed" && !this.snapshot.skipping ? this.snapshot.error : null,
  );
  /** True while a track is loaded, whether it is playing or paused. */
  readonly active = $derived(isActivePlayback(this.snapshot));
  /** Identifies the loaded session; stable across seeks, new for every track that loads. */
  readonly playbackId = $derived(this.#session?.playbackId ?? null);
  readonly durationMs = $derived(this.#session?.durationMs ?? null);
  readonly canGoPrevious = $derived(this.snapshot?.base.canGoPrevious ?? false);
  readonly canGoNext = $derived(this.snapshot?.base.canGoNext ?? false);
  readonly volume = $derived(this.volumePreview ?? this.snapshot?.base.volume ?? 1);
  readonly muted = $derived(this.snapshot?.base.muted ?? false);
  /** The chosen output device, or null for the system default. */
  readonly outputDeviceId = $derived.by(() => {
    const selection = this.snapshot?.base.outputSelection;
    return selection?.kind === "device" ? selection.deviceId : null;
  });
  readonly repeatMode = $derived<PlaybackRepeatMode>(this.queue?.repeatMode ?? "off");
  readonly shuffleEnabled = $derived(this.queue?.shuffleEnabled ?? false);
  /** Which library track is loaded, for highlighting track rows. */
  readonly activeTrackId = $derived(this.item?.trackId ?? null);

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
    if (!acceptsRevision(snapshot.base.revision, this.snapshot?.base.revision ?? null)) return;
    const incoming = snapshotItem(snapshot);
    const itemChanged = incoming?.queueItemId !== this.item?.queueItemId;
    if (itemChanged) {
      this.lastNavigation = this.#pendingNavigation ?? "next";
      this.#pendingNavigation = null;
      this.item = incoming;
    }
    this.snapshot = snapshot;
    this.clock.accept(clockReportOf(snapshot));
    if (snapshot.status === "failed" && snapshot.skipping) this.#noteSkip(snapshot.item);
  }

  /** Consecutive skips share one notice. */
  #noteSkip(item: PlaybackItem | null) {
    this.#skippedTitles.push(item?.title ?? "a track");
    const [first, ...others] = this.#skippedTitles;
    this.notice =
      others.length === 0
        ? `Couldn't play ${first}, skipped`
        : `Couldn't play ${first} and ${others.length} more, skipped`;
    if (this.#noticeTimer !== null) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => this.dismissNotice(), NOTICE_MS);
  }

  dismissNotice() {
    if (this.#noticeTimer !== null) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = null;
    this.#skippedTitles = [];
    this.notice = null;
  }

  #offerUndo(message: string) {
    this.undoOffer = message;
    if (this.#undoTimer !== null) clearTimeout(this.#undoTimer);
    this.#undoTimer = setTimeout(() => this.dismissUndo(), NOTICE_MS);
  }

  dismissUndo() {
    if (this.#undoTimer !== null) clearTimeout(this.#undoTimer);
    this.#undoTimer = null;
    this.undoOffer = null;
  }

  /** Puts back the queue the last replacement or "Clear upcoming" took away. */
  async undoQueueChange(): Promise<void> {
    this.dismissUndo();
    await this.#runTransport("start", () => this.#api.restorePreviousQueue());
  }

  acceptQueue(queue: PlaybackQueueSnapshot) {
    if (!acceptsRevision(queue.revision, this.queue?.revision ?? null)) return;
    this.queue = queue;
  }

  /**
   * Time only: a position for another session or seek than the snapshot's is stale. A paused
   * snapshot already holds the exact position, and a tick sent before the pause must not move it.
   */
  acceptPosition(position: PlaybackPosition) {
    const session = this.#session;
    if (session === null || this.status !== "playing") return;
    if (position.playbackId !== session.playbackId) return;
    if (position.seekRevision !== session.seekRevision) return;
    this.clock.accept(clockReportOf(this.snapshot, position));
  }

  acceptEvent(event: AppEvent) {
    if (event.event === "playbackStateChanged") this.acceptPlayback(event.payload);
    if (event.event === "playbackPositionChanged") this.acceptPosition(event.payload);
    if (event.event === "playbackQueueStateChanged") this.acceptQueue(event.payload);
  }

  /**
   * Runs a transport command. One that arrives while another is in flight waits for it, and a
   * newer one replaces it, so the latest press wins instead of being dropped.
   */
  #runTransport(
    command: TransportCommand,
    operation: () => Promise<PlaybackSnapshot>,
    navigation: PlaybackNavigation | null = null,
  ): Promise<boolean> {
    if (this.transportPending === null) {
      return this.#performTransport(command, operation, navigation);
    }
    this.#queuedTransport?.settle(false);
    return new Promise((settle) => {
      this.#queuedTransport = { command, operation, navigation, settle };
    });
  }

  async #performTransport(
    command: TransportCommand,
    operation: () => Promise<PlaybackSnapshot>,
    navigation: PlaybackNavigation | null,
  ): Promise<boolean> {
    this.transportPending = command;
    this.#pendingNavigation = navigation;
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
      const queued = this.#queuedTransport;
      this.#queuedTransport = null;
      if (queued !== null) {
        void this.#performTransport(queued.command, queued.operation, queued.navigation).then(
          queued.settle,
        );
      }
    }
  }

  async #runQueueCommand(operation: () => Promise<PlaybackQueueSnapshot>): Promise<boolean> {
    this.error = null;
    try {
      this.acceptQueue(await operation());
      return true;
    } catch (error) {
      this.#setError(error);
      return false;
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
    const replaced = this.queue?.current != null;
    const started = await this.#runTransport("start", () =>
      this.#api.startPlayback(context, startTrackId),
    );
    if (started && replaced) this.#offerUndo("Queue replaced");
  }

  /** A slice of the upcoming list beyond what the queue snapshot carries. */
  fetchQueueWindow(offset: number, limit: number) {
    return this.#api.getPlaybackQueueWindow(offset, limit);
  }

  pause() {
    return this.#runTransport("pause", () => this.#api.pausePlayback());
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  resume() {
    return this.#runTransport("resume", () => this.#api.resumePlayback());
  }

  previous() {
    return this.#runTransport("previous", () => this.#api.previousPlayback(), "previous");
  }

  next() {
    return this.#runTransport("next", () => this.#api.nextPlayback(), "next");
  }

  /**
   * Seeks. Requests made while one is in flight coalesce: only the latest is sent once the
   * first returns, so holding an arrow key keeps moving instead of dropping most presses.
   */
  async seek(positionMs: number) {
    // The one place every seek passes: the backend takes whole milliseconds.
    const rounded = Math.round(positionMs);
    const duration = this.durationMs;
    this.#requestedSeek = duration === null ? rounded : Math.min(Math.max(rounded, 0), duration);
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

  /** Sets the volume; changing it while muted unmutes, so the change is audible. */
  changeVolume(value: number) {
    this.setVolume(value);
    if (this.muted && !this.mutePending) void this.toggleMute();
  }

  /** Dismisses the last reported failure. */
  clearError() {
    this.error = null;
  }

  async toggleMute() {
    if (this.mutePending) return;
    this.mutePending = true;
    this.error = null;
    try {
      this.acceptPlayback(await this.#api.setPlaybackMuted(!this.muted));
    } catch (error) {
      this.#setError(error);
    } finally {
      this.mutePending = false;
    }
  }

  setShuffle(enabled: boolean) {
    return this.#runQueueCommand(() => this.#api.setPlaybackShuffle(enabled));
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  async shuffleAndStart(context: PlaybackContext) {
    if (!(await this.setShuffle(true))) return;
    await this.startPlayback(context, null);
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

  async clearQueue() {
    const hadUpcoming = (this.queue?.upcomingCount ?? 0) > 0;
    const cleared = await this.#runQueueCommand(() => this.#api.clearQueue());
    if (cleared && hadUpcoming) this.#offerUndo("Upcoming cleared");
    return cleared;
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
