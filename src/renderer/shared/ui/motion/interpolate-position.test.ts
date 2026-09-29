import { describe, expect, it } from "vitest";
import { estimatePosition, isSeekJump, SEEK_JUMP_THRESHOLD_MS } from "./interpolate-position";

describe("estimatePosition", () => {
  const anchor = { positionMs: 10_000, atMs: 1_000 };

  it("advances with the clock while playing", () => {
    expect(estimatePosition(anchor, 1_000, true, 60_000)).toBe(10_000);
    expect(estimatePosition(anchor, 1_400, true, 60_000)).toBe(10_400);
  });

  it("holds the reported position while paused", () => {
    expect(estimatePosition(anchor, 5_000, false, 60_000)).toBe(10_000);
  });

  it("never runs past the end of the track", () => {
    expect(estimatePosition(anchor, 100_000, true, 12_000)).toBe(12_000);
  });

  it("does not go backwards if the clock reads earlier than the anchor", () => {
    expect(estimatePosition(anchor, 500, true, null)).toBe(10_000);
  });
});

describe("isSeekJump", () => {
  it("treats ordinary drift between reports as a continuation", () => {
    expect(isSeekJump(10_400, 10_250)).toBe(false);
    expect(isSeekJump(10_000, 10_000 + SEEK_JUMP_THRESHOLD_MS)).toBe(false);
  });

  it("treats a large disagreement in either direction as a seek", () => {
    expect(isSeekJump(10_000, 40_000)).toBe(true);
    expect(isSeekJump(40_000, 10_000)).toBe(true);
  });
});
