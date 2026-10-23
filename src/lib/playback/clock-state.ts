import type { QueueItemId } from "#lib/native";
import { PositionEstimate, type PositionAnchor } from "#lib/ui/motion/position-estimate";

/** What a playback snapshot says about time: everything the clock needs, and nothing else. */
export interface ClockReport {
  itemId: QueueItemId;
  positionMs: number;
  durationMs: number | null;
  playing: boolean;
  /** Counts the seeks the backend has completed (`CurrentPlayback.seekRevision`). */
  seekRevision: number;
}

/**
 * The position moved on purpose. `kind` is a fact the backend reported (a seek completed, the
 * track changed), never a guess from how far the numbers moved.
 */
export interface ClockJump {
  id: number;
  kind: "seek" | "track";
  fromMs: number;
  toMs: number;
}

/**
 * The clock's view of time: the last report, the anchor it was taken at, and how many jumps it
 * has announced. A value object: `reduce` returns a new state and never changes this one.
 */
export class ClockState {
  public static readonly initial = new ClockState(null, { positionMs: 0, atMs: 0 }, 0);

  public readonly report: ClockReport | null;
  public readonly anchor: PositionAnchor;
  public readonly jumps: number;

  public constructor(report: ClockReport | null, anchor: PositionAnchor, jumps: number) {
    this.report = report;
    this.anchor = anchor;
    this.jumps = jumps;
  }

  /** Where playback is at `nowMs`, from the last report. Frozen while paused. */
  public estimate(nowMs: number): number {
    if (this.report === null) return 0;
    return PositionEstimate.of(this.anchor, nowMs, this.report.playing, this.report.durationMs);
  }

  /**
   * Takes in a report (`null` when nothing is loaded). Each report re-anchors the clock, so drift
   * between reports never accumulates. A jump is announced only for a change of track or of
   * `seekRevision`: a report that arrives late, or disagrees with the estimate, is just a
   * correction, so a slow IPC round trip can never look like a seek.
   */
  public reduce(
    report: ClockReport | null,
    nowMs: number,
  ): { state: ClockState; jump: ClockJump | null } {
    const anchor = { positionMs: report?.positionMs ?? 0, atMs: nowMs };
    const previous = this.report;
    if (report === null || previous === null) {
      return { state: new ClockState(report, anchor, this.jumps), jump: null };
    }
    const kind =
      report.itemId !== previous.itemId
        ? "track"
        : report.seekRevision !== previous.seekRevision
          ? "seek"
          : null;
    if (kind === null) return { state: new ClockState(report, anchor, this.jumps), jump: null };
    const jump: ClockJump = {
      id: this.jumps + 1,
      kind,
      fromMs: this.estimate(nowMs),
      toMs: report.positionMs,
    };
    return { state: new ClockState(report, anchor, jump.id), jump };
  }
}
