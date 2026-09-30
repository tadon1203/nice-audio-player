import { describe, expect, it } from "vitest";
import { estimatePosition } from "./interpolate-position";

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
