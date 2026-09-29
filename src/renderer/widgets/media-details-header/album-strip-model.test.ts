import { describe, expect, it } from "vitest";
import { segmentFill, segmentStarts, segmentStates } from "./album-strip-model";

const tracks = [
  { id: "a", durationMs: 100 },
  { id: "b", durationMs: 300 },
  { id: "c", durationMs: 100 },
];

describe("segmentStates", () => {
  it("marks tracks before, at, and after the playing one", () => {
    expect(segmentStates(tracks, "b")).toEqual(["past", "current", "future"]);
  });

  it("marks everything future when another album is playing", () => {
    expect(segmentStates(tracks, "x")).toEqual(["future", "future", "future"]);
    expect(segmentStates(tracks, null)).toEqual(["future", "future", "future"]);
  });
});

describe("segmentStarts", () => {
  it("gives each segment's start as a fraction of the album", () => {
    expect(segmentStarts(tracks)).toEqual([0, 0.2, 0.8]);
  });
});

describe("segmentFill", () => {
  it("clamps to the segment", () => {
    expect(segmentFill(50, 100)).toBe(0.5);
    expect(segmentFill(500, 100)).toBe(1);
    expect(segmentFill(10, null)).toBe(0);
  });
});
