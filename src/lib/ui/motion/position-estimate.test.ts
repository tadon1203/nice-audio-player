import { describe, expect, it } from "vitest";
import { PositionEstimate } from "./position-estimate";

describe("PositionEstimate.of", () => {
  const anchor = { positionMs: 10_000, atMs: 1_000 };

  it("advances with the clock while playing", () => {
    expect(PositionEstimate.of(anchor, 1_000, true, 60_000)).toBe(10_000);
    expect(PositionEstimate.of(anchor, 1_400, true, 60_000)).toBe(10_400);
  });

  it("holds the reported position while paused", () => {
    expect(PositionEstimate.of(anchor, 5_000, false, 60_000)).toBe(10_000);
  });

  it("never runs past the end of the track", () => {
    expect(PositionEstimate.of(anchor, 100_000, true, 12_000)).toBe(12_000);
  });

  it("does not go backwards if the clock reads earlier than the anchor", () => {
    expect(PositionEstimate.of(anchor, 500, true, null)).toBe(10_000);
  });
});
