/**
 * Playback position arrives about four times a second. The playback clock (`lib/playback`)
 * advances from the last reported position between reports; this is that arithmetic.
 */

export interface PositionAnchor {
  /** The last reported position. */
  positionMs: number;
  /** `performance.now()` when it was reported. */
  atMs: number;
}

/** Where playback is, between reports. Calculations only. */
export class PositionEstimate {
  /** Where playback is now, given the last report. Frozen while paused, clamped to the track. */
  public static of(
    anchor: PositionAnchor,
    nowMs: number,
    playing: boolean,
    durationMs: number | null,
  ): number {
    const elapsed = playing ? Math.max(0, nowMs - anchor.atMs) : 0;
    const estimate = anchor.positionMs + elapsed;
    return durationMs === null ? estimate : Math.min(durationMs, estimate);
  }
}
