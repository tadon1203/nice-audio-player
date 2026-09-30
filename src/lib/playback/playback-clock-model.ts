import { estimatePosition, type PositionAnchor } from "$lib/ui/motion/interpolate-position";

/** What a playback snapshot says about time: everything the clock needs, and nothing else. */
export type ClockReport = {
  itemId: string;
  positionMs: number;
  durationMs: number | null;
  playing: boolean;
  /** Counts the seeks the backend has completed (`ActiveSession.seekRevision`). */
  seekRevision: number;
};

/**
 * The position moved on purpose. `kind` is a fact the backend reported (a seek completed, the
 * track changed), never a guess from how far the numbers moved.
 */
export type ClockJump = {
  id: number;
  kind: "seek" | "track";
  fromMs: number;
  toMs: number;
};

export type ClockState = {
  report: ClockReport | null;
  anchor: PositionAnchor;
  jumps: number;
};

export const initialClockState: ClockState = {
  report: null,
  anchor: { positionMs: 0, atMs: 0 },
  jumps: 0,
};

/** Where playback is at `nowMs`, from the last report. Frozen while paused. */
export function estimateClock(state: ClockState, nowMs: number): number {
  const { report } = state;
  if (report === null) return 0;
  return estimatePosition(state.anchor, nowMs, report.playing, report.durationMs);
}

/**
 * Takes in a report (`null` when nothing is loaded). Each report re-anchors the clock, so drift
 * between reports never accumulates. A jump is announced only for a change of track or of
 * `seekRevision`: a report that arrives late, or disagrees with the estimate, is just a
 * correction, so a slow IPC round trip can never look like a seek.
 */
export function reduceClock(
  state: ClockState,
  report: ClockReport | null,
  nowMs: number,
): { state: ClockState; jump: ClockJump | null } {
  const anchor = { positionMs: report?.positionMs ?? 0, atMs: nowMs };
  const previous = state.report;
  if (report === null || previous === null) {
    return { state: { ...state, report, anchor }, jump: null };
  }
  const kind =
    report.itemId !== previous.itemId
      ? "track"
      : report.seekRevision !== previous.seekRevision
        ? "seek"
        : null;
  if (kind === null) return { state: { ...state, report, anchor }, jump: null };
  const jump: ClockJump = {
    id: state.jumps + 1,
    kind,
    fromMs: estimateClock(state, nowMs),
    toMs: report.positionMs,
  };
  return { state: { report, anchor, jumps: jump.id }, jump };
}
