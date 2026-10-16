import type {
  ActiveSession,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackItem,
  PlaybackPosition,
  PlaybackQueueSnapshot,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  Versioned,
} from "#lib/native";
import { Replica, SupersededError, type PlaybackClient } from "#lib/native";
import { createPlaybackClock, type PlaybackClock } from "./clock";
import { playbackCommandErrorMessage } from "./playback-errors";
import { clockReportOf, isActivePlayback, snapshotItem, snapshotSession } from "./snapshot";

export type PlaybackNavigation = "next" | "previous";
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
  operation: () => Promise<Versioned<PlaybackSnapshot>>;
  settle: (done: boolean) => void;
};

/**
 * Which way a new session's start moves the Now Playing transition. The backend says why the
 * session started: only Previous goes backward; every other start, or none, goes forward.
 */
function navigationOf(session: ActiveSession | null): PlaybackNavigation {
  return session?.startedBy === "previous" ? "previous" : "next";
}

/**
 * Mirrors the backend's playback state. The replicas hold what the backend said; everything a
 * component shows is a primitive derived from them, so a component re-renders only for the
 * fact it reads. Position never lands here: position events feed the clock and nothing else,
 * and `item` keeps its identity while the same queue item plays.
 */
export class Playback {
  readonly clock: PlaybackClock;
  readonly #client: PlaybackClient;
  readonly #snapshot = new Replica<PlaybackSnapshot>();
  readonly #queue = new Replica<PlaybackQueueSnapshot>();

  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  item = $state.raw<PlaybackItem | null>(null);
  /** How the current item was reached: Next/Previous, or anything else (counts as "next"). */
  lastNavigation = $state.raw<PlaybackNavigation>("next");
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

  #requestedVolume: number | null = null;
  #volumeWriteActive = false;
  #requestedSeek: number | null = null;
  // Latest wins, like the backend: one transport command waits for the one in flight.
  #queuedTransport: QueuedTransport | null = null;
  #skippedTitles: string[] = [];
  #noticeTimer: ReturnType<typeof setTimeout> | null = null;
  #undoTimer: ReturnType<typeof setTimeout> | null = null;

  /** The latest playback snapshot the backend sent, or null before the first one. */
  get snapshot(): PlaybackSnapshot | null {
    return this.#snapshot.value;
  }

  /** The revision the held snapshot was published with. */
  get playbackRevision(): number | null {
    return this.#snapshot.revision;
  }

  /** The latest queue snapshot the backend sent, or null before the first one. */
  get queue(): PlaybackQueueSnapshot | null {
    return this.#queue.value;
  }

  /** The revision the held queue was published with. */
  get queueRevision(): number | null {
    return this.#queue.revision;
  }

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

  constructor(client: PlaybackClient, clock: PlaybackClock = createPlaybackClock()) {
    this.#client = client;
    this.clock = clock;
  }

  #setError(error: unknown) {
    // A request replaced by a newer one has nothing to report.
    if (error instanceof SupersededError) return;
    this.error = error ? playbackCommandErrorMessage(error) : null;
  }

  /** Keeps the snapshot only if it is newer than the held one. Command responses come here too. */
  acceptPlayback(incoming: Versioned<PlaybackSnapshot>) {
    const snapshot = incoming.value;
    const incomingItem = snapshotItem(snapshot);
    if (!this.#snapshot.accept(incoming)) return;
    if (incomingItem?.queueItemId !== this.item?.queueItemId) {
      this.lastNavigation = navigationOf(snapshotSession(snapshot));
      this.item = incomingItem;
    }
    this.clock.accept(clockReportOf(snapshot));
  }

  /** The backend skipped a track by itself: its title, or null when it had none. Consecutive skips share one notice. */
  acceptSkip(title: string | null) {
    this.#skippedTitles.push(title ?? "a track");
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
    await this.#runTransport("start", () => this.#client.restorePreviousQueue());
  }

  /** Keeps the queue only if it is newer than the held one. Command responses come here too. */
  acceptQueue(incoming: Versioned<PlaybackQueueSnapshot>) {
    this.#queue.accept(incoming);
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

  /**
   * Runs a transport command. One that arrives while another is in flight waits for it, and a
   * newer one replaces it, so the latest press wins instead of being dropped.
   */
  #runTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackSnapshot>>,
  ): Promise<boolean> {
    if (this.transportPending === null) {
      return this.#performTransport(command, operation);
    }
    this.#queuedTransport?.settle(false);
    return new Promise((settle) => {
      this.#queuedTransport = { command, operation, settle };
    });
  }

  async #performTransport(
    command: TransportCommand,
    operation: () => Promise<Versioned<PlaybackSnapshot>>,
  ): Promise<boolean> {
    this.transportPending = command;
    this.error = null;
    try {
      this.acceptPlayback(await operation());
      return true;
    } catch (error) {
      this.#setError(error);
      return false;
    } finally {
      this.transportPending = null;
      const queued = this.#queuedTransport;
      this.#queuedTransport = null;
      if (queued !== null) {
        void this.#performTransport(queued.command, queued.operation).then(queued.settle);
      }
    }
  }

  async #runQueueCommand(
    operation: () => Promise<Versioned<PlaybackQueueSnapshot>>,
  ): Promise<boolean> {
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
        this.acceptPlayback(await this.#client.setVolume(value));
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

  /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
  async startPlayback(context: PlaybackContext, startTrackId: string | null): Promise<void> {
    await this.#runTransport("start", () => this.#client.start(context, startTrackId));
  }

  /** A slice of the upcoming list beyond what the queue snapshot carries. */
  fetchQueueWindow(offset: number, limit: number) {
    return this.#client.queueWindow(offset, limit);
  }

  pause() {
    return this.#runTransport("pause", () => this.#client.pause());
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  resume() {
    return this.#runTransport("resume", () => this.#client.resume());
  }

  previous() {
    return this.#runTransport("previous", () => this.#client.previous());
  }

  next() {
    return this.#runTransport("next", () => this.#client.next());
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
        this.acceptPlayback(await this.#client.seek(value));
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
      this.acceptPlayback(await this.#client.setMuted(!this.muted));
    } catch (error) {
      this.#setError(error);
    } finally {
      this.mutePending = false;
    }
  }

  setShuffle(enabled: boolean) {
    return this.#runQueueCommand(() => this.#client.setShuffle(enabled));
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  async shuffleAndStart(context: PlaybackContext) {
    if (!(await this.setShuffle(true))) return;
    await this.startPlayback(context, null);
  }

  setRepeatMode(mode: PlaybackRepeatMode) {
    return this.#runQueueCommand(() => this.#client.setRepeatMode(mode));
  }

  removeQueueItem(id: string) {
    return this.#runQueueCommand(() => this.#client.removeQueueItem(id));
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  moveQueueItem(id: string, to: number) {
    return this.#runQueueCommand(() => this.#client.moveQueueItem(id, to));
  }

  async clearQueue() {
    const hadUpcoming = (this.queue?.upcomingCount ?? 0) > 0;
    const cleared = await this.#runQueueCommand(() => this.#client.clearQueue());
    if (cleared && hadUpcoming) this.#offerUndo("Upcoming cleared");
    return cleared;
  }

  /** Jumps to an upcoming item and plays it. */
  playQueueItem(id: string) {
    return this.#runTransport("start", () => this.#client.playQueueItem(id));
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  enqueueTrack(trackId: string, next: boolean) {
    return this.#runQueueCommand(() => this.#client.enqueueTrack(trackId, next));
  }

  /** A loaded track restarts on the new device at the same position. */
  setOutputSelection(selection: AudioOutputSelection) {
    return this.#runTransport("outputSelection", () => this.#client.setOutputSelection(selection));
  }
}
