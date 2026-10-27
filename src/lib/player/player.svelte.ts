import { queryOptions, type QueryClient } from "@tanstack/svelte-query";
import {
  UPCOMING_WINDOW,
  type AlbumId,
  type AudioOutputDevice,
  type AudioOutputSelection,
  type CurrentPlayback,
  type PlaybackContext,
  type PlaybackFailureCode,
  type PlaybackId,
  type PlaybackPosition,
  type PlaybackWaveform,
  type PlayerState,
  type QueueItem,
  type QueueItemId,
  type QueueState,
  type QueueWindow,
  type RepeatMode,
  type TrackId,
} from "#lib/native/bindings";
import type * as native from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import type { ResultQueryOptions } from "#lib/native/query-types";
import { AudioFormatText } from "#lib/utils/audio-format-text";
import { UNDO_CLEARED_MESSAGE } from "./messages";
import { PlaybackClock, type ClockReport } from "./playback-clock.svelte";

/** The queue window query key root; a window is keyed by the queue version it was cut from. */
const QUEUE_WINDOW_KEY = "queueWindow";

/** The key of a queue window: its root, the queue version it is cut from, and its offset. */
function queueWindowKey(version: number | null, offset: number): readonly unknown[] {
  return [QUEUE_WINDOW_KEY, version, offset];
}

/** How close the pushed volume must be to the one set for the preview to clear (the backend holds f32). */
const VOLUME_TOLERANCE = 1e-4;

/** A seek sent and not yet shown: the position asked for, and the session and seek count it began from. */
interface PendingSeek {
  positionMs: number;
  playbackId: PlaybackId | null;
  seekCount: number;
}

/** The facts of the Signal path that the dock describes, as the backend reports them. */
export type SignalPathFacts = Pick<
  CurrentPlayback,
  "resamplingActive" | "outputSampleRate" | "channelConversion"
> & {
  sourceLabel: string;
  outputName: string;
  selection: AudioOutputSelection;
};

/** The part of the app's notices that the Player offers an undo through. The app passes its notices. */
export interface UndoOffers {
  offerUndo(message: string): void;
}

/** Repeat cycles off, all, one; `↻¹` is the last step. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}

/** The session of a playing or paused Player state; null in every other state. */
function sessionOf(state: PlayerState | undefined): CurrentPlayback | null {
  return state?.status === "playing" || state?.status === "paused" ? state.session : null;
}

/** The clock's report of a state, with the position of a newer position event when there is one. */
function clockReportOf(state: PlayerState, position?: PlaybackPosition): ClockReport | null {
  const session = sessionOf(state);
  if (session === null) return null;
  return {
    itemId: session.item.queueItemId,
    positionMs: position?.positionMs ?? session.positionMs,
    durationMs: session.durationMs,
    playing: state.status === "playing",
    seekCount: session.seekCount,
  };
}

/**
 * The Renderer's glue to the Player. It holds the Player state and the Queue state the backend
 * pushes, sends each Command at once, and reads these values through getters. It holds no rule
 * of its own beyond what the display needs in the time before a push arrives: a seek and a volume
 * show at once, until the pushed state settles them.
 *
 * A command answers only whether the backend accepted it, so its effect shows when the pushed
 * state arrives.
 */
export class Player {
  readonly #commands: typeof native.player;
  readonly #queryClient: QueryClient;
  readonly #notices: UndoOffers;
  /** The clock that follows this playback's position. */
  public readonly clock = new PlaybackClock();

  #state = $state.raw<PlayerState | undefined>(undefined);
  #queue = $state.raw<QueueState | undefined>(undefined);
  #waveformHeld = $state.raw<PlaybackWaveform | null>(null);
  #outputDevices = $state.raw<AudioOutputDevice[]>([]);
  #pendingSeek = $state.raw<PendingSeek | null>(null);
  #volumePreview = $state.raw<number | null>(null);
  /** The loaded track, or the last one that played. Replaced only when the queue item changes. */
  #item = $state.raw<QueueItem | undefined>(undefined);

  readonly #session = $derived(sessionOf(this.#state));

  public constructor(deps: {
    player: typeof native.player;
    queryClient: QueryClient;
    notices: UndoOffers;
  }) {
    this.#commands = deps.player;
    this.#queryClient = deps.queryClient;
    this.#notices = deps.notices;
  }

  /** The Player state the backend pushed; undefined until the first push. */
  public get state(): PlayerState | undefined {
    return this.#state;
  }

  /** The Queue state the backend pushed; undefined until the first push. */
  public get queue(): QueueState | undefined {
    return this.#queue;
  }

  /**
   * The loaded track, or the last one that played. A track that is loading shows at once. The value
   * keeps its identity while the same queue item plays, so a reader does not rerun for each push.
   */
  public get item(): QueueItem | undefined {
    return this.#item;
  }

  /**
   * How the current session was reached: Previous goes backward; every other start goes forward.
   * `none` when no session is loaded.
   */
  public get transitionDirection(): "forward" | "backward" | "none" {
    const session = this.#session;
    if (session === null) return "none";
    return session.startedBy === "previous" ? "backward" : "forward";
  }

  /** The loaded track's Waveform, or undefined while it is analyzed or it belongs to another playback. */
  public get waveform(): PlaybackWaveform | undefined {
    const held = this.#waveformHeld;
    return held !== null && held.playbackId === this.playbackId ? held : undefined;
  }

  /** The facts of the Signal path of the loaded track, or null when no track is loaded. */
  public get signalPath(): SignalPathFacts | null {
    const state = this.#state;
    if (state === undefined || (state.status !== "playing" && state.status !== "paused")) {
      return null;
    }
    const { session } = state;
    return {
      sourceLabel: AudioFormatText.path({
        format: session.sourceFormat,
        bitDepth: session.sourceBitDepth,
        sampleRate: session.sourceSampleRate,
        bitrateKbps: session.sourceBitrateKbps,
      }),
      resamplingActive: session.resamplingActive,
      outputSampleRate: session.outputSampleRate,
      channelConversion: session.channelConversion,
      outputName: session.outputDeviceName,
      selection: state.base.outputSelection,
    };
  }

  /** The output devices the last listing found; empty until a menu opens for the first time. */
  public get outputDevices(): AudioOutputDevice[] {
    return this.#outputDevices;
  }

  /** The position a seek asked for, until the backend shows it; undefined when none is pending. */
  public get pendingSeekMs(): number | undefined {
    return this.#pendingSeek?.positionMs;
  }

  /** The volume the user set, until the backend reports it; undefined when none is pending. */
  public get volumePreview(): number | undefined {
    return this.#volumePreview ?? undefined;
  }

  /** True while a track is loaded, whether it is playing or paused. */
  public get isActive(): boolean {
    return this.#session !== null;
  }

  public get isPlaying(): boolean {
    return this.#state?.status === "playing";
  }

  public get status(): PlayerState["status"] {
    return this.#state?.status ?? "stopped";
  }

  /** Why playback stopped on an output failure, until a retry or another play. */
  public get failure(): PlaybackFailureCode | null {
    return this.#state?.status === "failed" && !this.#state.skipping ? this.#state.error : null;
  }

  /** Identifies the loaded session; stable across seeks, new for every track that loads. */
  public get playbackId(): PlaybackId | null {
    return this.#session?.playbackId ?? null;
  }

  public get durationMs(): number | null {
    return this.#session?.durationMs ?? null;
  }

  public get canGoPrevious(): boolean {
    return this.#state?.base.canGoPrevious ?? false;
  }

  public get canGoNext(): boolean {
    return this.#state?.base.canGoNext ?? false;
  }

  /** The volume shown: the preview while it is pending, else the backend's. */
  public get volume(): number {
    return this.volumePreview ?? this.#state?.base.volume ?? 1;
  }

  public get muted(): boolean {
    return this.#state?.base.muted ?? false;
  }

  /** The chosen output device, or null for the system default. */
  public get outputDeviceId(): string | null {
    const selection = this.#state?.base.outputSelection;
    return selection?.kind === "device" ? selection.deviceId : null;
  }

  public get repeatMode(): RepeatMode {
    return this.#queue?.repeatMode ?? "off";
  }

  public get shuffleEnabled(): boolean {
    return this.#queue?.shuffleEnabled ?? false;
  }

  /** Which library track is loaded, for highlighting track rows. */
  public get activeTrackId(): TrackId | null {
    return this.#item?.id ?? null;
  }

  /** True while the album's track is loaded and playing or paused. */
  public isAlbumLoaded(albumId: AlbumId): boolean {
    return this.isActive && this.#item?.album?.id === albumId;
  }

  /** Replaces the held Player state with the one the backend pushed. */
  public acceptState(state: PlayerState): void {
    this.#state = state;
    const item = itemOf(state);
    if (!sameItem(item, this.#item)) this.#item = item;
    this.#settlePendingSeek(sessionOf(state));
    if (
      this.#volumePreview !== null &&
      Math.abs(state.base.volume - this.#volumePreview) < VOLUME_TOLERANCE
    ) {
      this.#volumePreview = null;
    }
    this.clock.accept(clockReportOf(state));
  }

  /** Replaces the held Queue state with the one the backend pushed. Windows of older versions go. */
  public acceptQueue(queue: QueueState): void {
    const previousVersion = this.#queue?.version;
    this.#queue = queue;
    if (previousVersion !== undefined && previousVersion !== queue.version) {
      this.#queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === QUEUE_WINDOW_KEY && query.queryKey[1] !== queue.version,
      });
    }
  }

  /** Replaces the held Waveform with the one the backend pushed. */
  public acceptWaveform(waveform: PlaybackWaveform | null): void {
    this.#waveformHeld = waveform;
  }

  /**
   * Time only: a position for another session or seek than the state's is stale. A paused state
   * already holds the exact position, and a tick sent before the pause must not move it.
   */
  public acceptPosition(position: PlaybackPosition): void {
    const session = this.#session;
    if (session === null || this.#state?.status !== "playing") return;
    if (position.playbackId !== session.playbackId) return;
    if (position.seekCount !== session.seekCount) return;
    this.clock.accept(clockReportOf(this.#state, position));
  }

  /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
  public play(context: PlaybackContext, startTrackId: TrackId | null): Promise<Result<null>> {
    return this.#commands.play(context, startTrackId);
  }

  public pause(): Promise<Result<null>> {
    return this.#commands.pause();
  }

  /** Resumes a paused track; after a failure, retries the current item with the queue intact. */
  public resume(): Promise<Result<null>> {
    return this.#commands.resume();
  }

  /** Plays the album from its first track if it is not loaded; otherwise pauses or resumes it. */
  public togglePlayAlbum(albumId: AlbumId): Promise<Result<null>> {
    if (!this.isAlbumLoaded(albumId)) {
      return this.play({ kind: "album", albumId }, null);
    }
    return this.isPlaying ? this.pause() : this.resume();
  }

  public previous(): Promise<Result<null>> {
    return this.#commands.previous();
  }

  public next(): Promise<Result<null>> {
    return this.#commands.next();
  }

  /** Seeks to `positionMs`, which the backend clamps to the duration. The position shows at once. */
  public async seek(positionMs: number): Promise<Result<null>> {
    // The one place every seek passes: the backend takes whole milliseconds.
    const target = Math.round(positionMs);
    const session = this.#session;
    this.#pendingSeek = {
      positionMs: target,
      playbackId: session?.playbackId ?? null,
      seekCount: session?.seekCount ?? 0,
    };
    const result = await this.#commands.seek(target);
    // A refused seek never happens, so its position must not keep showing.
    if (!result.ok) this.#pendingSeek = null;
    return result;
  }

  /** Sets the volume, shown at once until the backend reports it. Changing it while muted unmutes. */
  public async setVolume(volume: number): Promise<Result<null>> {
    this.#volumePreview = volume;
    const [volumeResult, unmuteResult] = await Promise.all([
      this.#commands.setVolume(volume),
      this.muted ? this.setMuted(false) : null,
    ]);
    // A refused volume is not set, so the preview must not keep showing it.
    if (!volumeResult.ok) {
      this.#volumePreview = null;
      return volumeResult;
    }
    if (unmuteResult !== null && !unmuteResult.ok) return unmuteResult;
    return { ok: true, value: null };
  }

  public setMuted(muted: boolean): Promise<Result<null>> {
    return this.#commands.setMuted(muted);
  }

  public setShuffle(enabled: boolean): Promise<Result<null>> {
    return this.#commands.setShuffle(enabled);
  }

  /** Turns the global shuffle on, then replaces the queue with `context`. Nothing starts if the shuffle cannot be turned on. */
  public async shuffleAndStart(context: PlaybackContext): Promise<Result<null>> {
    const shuffle = await this.setShuffle(true);
    if (!shuffle.ok) return shuffle;
    return this.play(context, null);
  }

  public setRepeatMode(mode: RepeatMode): Promise<Result<null>> {
    return this.#commands.setRepeatMode(mode);
  }

  /** Adds a library track right after the current one (`next`) or at the end. */
  public enqueue(track: TrackId, next: boolean): Promise<Result<null>> {
    return this.#commands.enqueueTrack(track, next);
  }

  public removeQueueItem(id: QueueItemId): Promise<Result<null>> {
    return this.#commands.removeQueueItem(id);
  }

  /** Moves an upcoming item to `to`, an index into the upcoming list (0 is next up). */
  public moveQueueItem(id: QueueItemId, to: number): Promise<Result<null>> {
    return this.#commands.moveQueueItem(id, to);
  }

  /** Jumps to an upcoming item and plays it. */
  public playQueueItem(id: QueueItemId): Promise<Result<null>> {
    return this.#commands.playQueueItem(id);
  }

  /** Clears the upcoming items, and offers to undo it when there was anything to clear. */
  public async clearUpcoming(): Promise<Result<null>> {
    const hadUpcoming = (this.#queue?.upcomingCount ?? 0) > 0;
    const result = await this.#commands.clearQueue();
    if (result.ok && hadUpcoming) this.#notices.offerUndo(UNDO_CLEARED_MESSAGE);
    return result;
  }

  /** Puts back the queue that the last replacement or "Clear upcoming" took away. */
  public restorePreviousQueue(): Promise<Result<null>> {
    return this.#commands.restorePreviousQueue();
  }

  /** A loaded track restarts on the new device at the same position. */
  public setOutputSelection(selection: AudioOutputSelection): Promise<Result<null>> {
    return this.#commands.setOutputSelection(selection);
  }

  /** Reads the device list now. A failed read returns its error; the list then keeps its last value. */
  public async refreshOutputDevices(): Promise<Result<AudioOutputDevice[]>> {
    const result = await this.#commands.listOutputDevices();
    if (result.ok) this.#outputDevices = result.value;
    return result;
  }

  /** A window of the upcoming items, keyed by the queue version it is cut from. */
  public queueWindowOptions(offset: number): ResultQueryOptions<QueueWindow> {
    const version = this.#queue?.version ?? null;
    return queryOptions({
      queryKey: queueWindowKey(version, offset),
      queryFn: () => this.#commands.queueWindow(offset, UPCOMING_WINDOW),
      enabled: version !== null,
    });
  }

  /** Clears the settled pending seek: a session that is not the seek's, a later seek count, or no session. */
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

/** The loaded track, or the last one that played. */
function itemOf(state: PlayerState): QueueItem | undefined {
  if (state.status === "playing" || state.status === "paused") return state.session.item;
  return state.item ?? undefined;
}

/** Two items are the same when every field matches, so a re-pushed item with new fields replaces the held one. */
function sameItem(a: QueueItem | undefined, b: QueueItem | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
