import type {
  ActiveSession,
  PlaybackItem,
  PlaybackRepeatMode,
  PlaybackSnapshot,
} from "$lib/native";
import type { ClockReport } from "./playback-clock-model";

export type ActivePlaybackSnapshot = Extract<PlaybackSnapshot, { status: "playing" | "paused" }>;

/** True while a track is loaded, whether it is playing or paused. */
export function isActivePlayback(
  snapshot: PlaybackSnapshot | null | undefined,
): snapshot is ActivePlaybackSnapshot {
  return snapshot?.status === "playing" || snapshot?.status === "paused";
}

export function snapshotSession(snapshot: PlaybackSnapshot | null): ActiveSession | null {
  return isActivePlayback(snapshot) ? snapshot.session : null;
}

/** The loaded track, or the last one that played while stopped. */
export function snapshotItem(snapshot: PlaybackSnapshot | null): PlaybackItem | null {
  if (snapshot === null) return null;
  return isActivePlayback(snapshot) ? snapshot.session.item : snapshot.item;
}

/** What the clock needs from a snapshot. */
export function clockReportOf(snapshot: PlaybackSnapshot | null): ClockReport | null {
  if (!isActivePlayback(snapshot)) return null;
  const { session } = snapshot;
  return {
    itemId: session.item.queueItemId,
    positionMs: session.positionMs,
    durationMs: session.durationMs,
    playing: snapshot.status === "playing",
    seekRevision: session.seekRevision,
  };
}

/** Repeat cycles off, all, one; `↻¹` is the last step. */
export function nextRepeatMode(mode: PlaybackRepeatMode): PlaybackRepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}
