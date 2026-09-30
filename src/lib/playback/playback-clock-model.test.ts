import { describe, expect, it } from "vitest";
import {
  estimateClock,
  initialClockState,
  reduceClock,
  type ClockReport,
  type ClockState,
} from "./playback-clock-model";

const report = (overrides: Partial<ClockReport> = {}): ClockReport => ({
  itemId: "a",
  positionMs: 10_000,
  durationMs: 60_000,
  playing: true,
  seekRevision: 0,
  ...overrides,
});

/** Feeds reports in order, each at its own time, and collects the jumps. */
function run(steps: [number, ClockReport | null][]) {
  let state: ClockState = initialClockState;
  const jumps = [];
  for (const [at, next] of steps) {
    const result = reduceClock(state, next, at);
    state = result.state;
    if (result.jump) jumps.push(result.jump);
  }
  return { state, jumps };
}

describe("estimateClock", () => {
  it("advances while playing and holds while paused", () => {
    const { state } = run([[1_000, report()]]);
    expect(estimateClock(state, 1_500)).toBe(10_500);
    const paused = run([[1_000, report({ playing: false })]]).state;
    expect(estimateClock(paused, 5_000)).toBe(10_000);
  });

  it("is 0 with nothing loaded", () => {
    expect(estimateClock(initialClockState, 5_000)).toBe(0);
  });
});

describe("reduceClock", () => {
  it("announces nothing for the first report or for ordinary ticks", () => {
    const { jumps } = run([
      [0, report({ positionMs: 0 })],
      [250, report({ positionMs: 250 })],
      [500, report({ positionMs: 500 })],
    ]);
    expect(jumps).toEqual([]);
  });

  it("announces one seek when the seek revision changes, with where it came from", () => {
    const { jumps } = run([
      [0, report({ positionMs: 10_000 })],
      [2_000, report({ positionMs: 42_000, seekRevision: 1 })],
      [2_250, report({ positionMs: 42_250, seekRevision: 1 })],
    ]);
    expect(jumps).toEqual([{ id: 1, kind: "seek", fromMs: 12_000, toMs: 42_000 }]);
  });

  it("counts a seek to the very same place, because the backend said it happened", () => {
    const { jumps } = run([
      [0, report()],
      [0, report({ seekRevision: 1 })],
    ]);
    expect(jumps.map((jump) => jump.kind)).toEqual(["seek"]);
  });

  it("announces a track change", () => {
    const { jumps } = run([
      [0, report({ positionMs: 59_000 })],
      [900, report({ itemId: "b", positionMs: 0 })],
    ]);
    expect(jumps).toEqual([{ id: 1, kind: "track", fromMs: 59_900, toMs: 0 }]);
  });

  it("does not mistake a late report for a seek", () => {
    // The report is 3s behind where the clock has run: a slow round trip, not a seek.
    const { jumps, state } = run([
      [0, report({ positionMs: 10_000 })],
      [4_000, report({ positionMs: 11_000 })],
    ]);
    expect(jumps).toEqual([]);
    expect(estimateClock(state, 4_000)).toBe(11_000);
  });

  it("does not announce pausing, resuming or unloading", () => {
    const { jumps } = run([
      [0, report()],
      [1_000, report({ positionMs: 11_000, playing: false })],
      [2_000, report({ positionMs: 11_000, playing: true })],
      [3_000, null],
    ]);
    expect(jumps).toEqual([]);
  });

  it("numbers jumps in order", () => {
    const { jumps } = run([
      [0, report()],
      [10, report({ seekRevision: 1 })],
      [20, report({ seekRevision: 2 })],
      [30, report({ itemId: "b", seekRevision: 2 })],
    ]);
    expect(jumps.map((jump) => jump.id)).toEqual([1, 2, 3]);
  });
});
