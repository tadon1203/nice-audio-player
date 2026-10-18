import { describe, expect, it } from "vitest";
import { SegmentStrip } from "./segment-strip";

const tracks = [
  { id: 1, durationMs: 100 },
  { id: 2, durationMs: 300 },
  { id: 3, durationMs: 100 },
];

describe("SegmentStrip.states", () => {
  it("marks tracks before, at, and after the playing one", () => {
    expect(SegmentStrip.states(tracks, 2)).toEqual(["past", "current", "future"]);
  });

  it("marks everything future when another album is playing", () => {
    expect(SegmentStrip.states(tracks, 9)).toEqual(["future", "future", "future"]);
    expect(SegmentStrip.states(tracks, null)).toEqual(["future", "future", "future"]);
  });
});

describe("SegmentStrip.starts", () => {
  it("gives each segment's start as a fraction of the album", () => {
    expect(SegmentStrip.starts(tracks)).toEqual([0, 0.2, 0.8]);
  });
});

describe("SegmentStrip.fill", () => {
  it("clamps to the segment", () => {
    expect(SegmentStrip.fill(50, 100)).toBe(0.5);
    expect(SegmentStrip.fill(500, 100)).toBe(1);
    expect(SegmentStrip.fill(10, null)).toBe(0);
  });
});
