import { describe, expect, it } from "vitest";
import {
  nextSeekPosition,
  positionFromOffset,
  scrubGain,
  scrubPosition,
  SEEK_KEY_STEP_MS,
} from "./seek-math";

describe("nextSeekPosition", () => {
  it("steps by the seek key step and ignores other keys", () => {
    expect(nextSeekPosition("ArrowRight", 1_000, 60_000)).toBe(1_000 + SEEK_KEY_STEP_MS);
    expect(nextSeekPosition("ArrowLeft", 1_000, 60_000)).toBe(1_000 - SEEK_KEY_STEP_MS);
    expect(nextSeekPosition("End", 1_000, 60_000)).toBe(60_000);
    expect(nextSeekPosition("Home", 1_000, 60_000)).toBe(0);
    expect(nextSeekPosition("a", 1_000, 60_000)).toBeNull();
  });
});

describe("positionFromOffset", () => {
  it("maps linearly and clamps to the bar", () => {
    expect(positionFromOffset(50, 100, 200_000)).toBe(100_000);
    expect(positionFromOffset(-20, 100, 200_000)).toBe(0);
    expect(positionFromOffset(500, 100, 200_000)).toBe(200_000);
    expect(positionFromOffset(10, 0, 200_000)).toBe(0);
  });
});

describe("scrubGain", () => {
  it("follows the pointer 1:1 on the bar and near it", () => {
    expect(scrubGain(0, false)).toBe(1);
    expect(scrubGain(24, false)).toBe(1);
    expect(scrubGain(-24, false)).toBe(1);
  });

  it("slows down further from the bar, symmetrically, down to a floor", () => {
    expect(scrubGain(24 + 48, false)).toBeCloseTo(0.5);
    expect(scrubGain(-(24 + 96), false)).toBeCloseTo(0.25);
    expect(scrubGain(10_000, false)).toBe(1 / 32);
  });

  it("slows a further tenfold with Shift", () => {
    expect(scrubGain(0, true)).toBeCloseTo(0.1);
  });
});

describe("scrubPosition", () => {
  it("moves the position by the gained share of the track", () => {
    expect(scrubPosition(10_000, 100, 1, 1000, 200_000)).toBe(30_000);
    expect(scrubPosition(10_000, 100, 0.5, 1000, 200_000)).toBe(20_000);
    expect(scrubPosition(10_000, 0, 1, 0, 200_000)).toBe(0);
  });
});
