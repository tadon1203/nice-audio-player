/**
 * Playback position arrives about four times a second. Anything that draws it smoothly
 * (progress fill, playhead, per-line lyric progress) advances from the last reported position
 * with the clock instead, and only springs when the position jumps (a seek or a new track).
 */

/** A drift larger than this between the estimate and a report is a seek, not clock jitter. */
export const SEEK_JUMP_THRESHOLD_MS = 1_000;

export type PositionAnchor = {
  /** The last reported position. */
  positionMs: number;
  /** `performance.now()` when it was reported. */
  atMs: number;
};

/** Where playback is now, given the last report. Frozen while paused, clamped to the track. */
export function estimatePosition(
  anchor: PositionAnchor,
  nowMs: number,
  playing: boolean,
  durationMs: number | null,
): number {
  const elapsed = playing ? Math.max(0, nowMs - anchor.atMs) : 0;
  const estimate = anchor.positionMs + elapsed;
  return durationMs === null ? estimate : Math.min(durationMs, estimate);
}

/** True when a report disagrees with the running estimate by more than clock jitter. */
export function isSeekJump(estimatedMs: number, reportedMs: number): boolean {
  return Math.abs(reportedMs - estimatedMs) > SEEK_JUMP_THRESHOLD_MS;
}
