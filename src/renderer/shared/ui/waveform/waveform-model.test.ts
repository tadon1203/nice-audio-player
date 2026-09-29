import { describe, expect, it } from "vitest";
import {
  barCountForWidth,
  FISHEYE_MAX_SCALE,
  FISHEYE_RADIUS_PX,
  fisheyeScale,
  nextSeekPosition,
  positionFromOffset,
  resampleBars,
} from "./waveform-model";

describe("resampleBars", () => {
  it("keeps the loudest bucket of each merged span", () => {
    expect(resampleBars([10, 200, 30, 40, 50, 60], 3)).toEqual([200, 40, 60]);
  });

  it("never invents bars beyond the data", () => {
    expect(resampleBars([1, 2, 3], 10)).toEqual([1, 2, 3]);
    expect(resampleBars([], 10)).toEqual([]);
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

describe("nextSeekPosition", () => {
  it("steps by five seconds within bounds and ignores other keys", () => {
    expect(nextSeekPosition("ArrowRight", 1_000, 60_000)).toBe(6_000);
    expect(nextSeekPosition("ArrowLeft", 1_000, 60_000)).toBe(0);
    expect(nextSeekPosition("End", 1_000, 60_000)).toBe(60_000);
    expect(nextSeekPosition("a", 1_000, 60_000)).toBeNull();
  });
});

describe("barCountForWidth", () => {
  it("fits at least one bar", () => {
    expect(barCountForWidth(0)).toBe(1);
    expect(barCountForWidth(300)).toBe(100);
  });
});

describe("fisheyeScale", () => {
  it("is widest at the pointer and gone at the edge of the radius", () => {
    expect(fisheyeScale(0)).toBeCloseTo(FISHEYE_MAX_SCALE);
    expect(fisheyeScale(FISHEYE_RADIUS_PX)).toBe(1);
    expect(fisheyeScale(-200)).toBe(1);
  });

  it("falls off evenly on both sides", () => {
    expect(fisheyeScale(-20)).toBeCloseTo(fisheyeScale(20));
    expect(fisheyeScale(10)).toBeGreaterThan(fisheyeScale(30));
  });
});
