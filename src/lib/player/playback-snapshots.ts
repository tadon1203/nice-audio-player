import {
  type CurrentPlayback,
  type QueueItem,
  type PlaybackPosition,
  type RepeatMode,
  type PlayerState,
} from "#lib/native/bindings";
import type { ClockReport } from "./clock-state";

export type ActivePlaybackSnapshot = Extract<PlayerState, { status: "playing" | "paused" }>;

/** Reads a playback snapshot. Pure: nothing is stored here. */
export class PlaybackSnapshots {
  /** True while a track is loaded, whether it is playing or paused. */
  public static isActive(
    snapshot: PlayerState | null | undefined,
  ): snapshot is ActivePlaybackSnapshot {
    return snapshot?.status === "playing" || snapshot?.status === "paused";
  }

  public static session(snapshot: PlayerState | null): CurrentPlayback | null {
    return PlaybackSnapshots.isActive(snapshot) ? snapshot.session : null;
  }

  /** The loaded track, or the last one that played while stopped. */
  public static item(snapshot: PlayerState | null): QueueItem | null {
    if (snapshot === null) return null;
    return PlaybackSnapshots.isActive(snapshot) ? snapshot.session.item : snapshot.item;
  }

  /**
   * What the clock needs from a snapshot, with the position of a newer position event when there
   * is one. A position that is not for this session and seek is stale and ignored.
   */
  public static clockReport(
    snapshot: PlayerState | null,
    position?: PlaybackPosition,
  ): ClockReport | null {
    if (!PlaybackSnapshots.isActive(snapshot)) return null;
    const { session } = snapshot;
    return {
      itemId: session.item.queueItemId,
      positionMs: position?.positionMs ?? session.positionMs,
      durationMs: session.durationMs,
      playing: snapshot.status === "playing",
      seekCount: session.seekCount,
    };
  }

  /** Repeat cycles off, all, one; `↻¹` is the last step. */
  public static nextRepeatMode(mode: RepeatMode): RepeatMode {
    return mode === "off" ? "all" : mode === "all" ? "one" : "off";
  }
}
