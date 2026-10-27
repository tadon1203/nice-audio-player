import { describe, expect, it } from "vitest";
import { SpringCurve } from "./spring-curve";

describe("SpringCurve.easing", () => {
  it("starts at 0 with zero slope and ends exactly at 1", () => {
    expect(SpringCurve.easing(0)).toBe(0);
    expect(SpringCurve.easing(1)).toBe(1);
    expect(SpringCurve.easing(0.001)).toBeLessThan(1e-4);
  });

  it("rises monotonically and never exceeds 1", () => {
    let last = 0;
    for (let index = 1; index <= 1000; index += 1) {
      const value = SpringCurve.easing(index / 1000);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(1);
      last = value;
    }
  });
});

describe("SpringCurve.settlingLength", () => {
  it("runs about 1.18 times the perceptual duration", () => {
    expect(SpringCurve.settlingLength(100)).toBe(118);
    expect(SpringCurve.settlingLength(300)).toBe(355);
  });
});

describe("SpringCurve.linear", () => {
  it("is 41 evenly spaced points that agree with the easing", () => {
    const points = SpringCurve.linear.slice("linear(".length, -1).split(", ").map(Number);
    expect(points).toHaveLength(41);
    points.forEach((value, index) => {
      expect(Math.abs(value - SpringCurve.easing(index / 40))).toBeLessThan(1e-4);
    });
    for (let index = 0; index < 400; index += 1) {
      const progress = index / 400;
      const at = progress * 40;
      const low = Math.floor(at);
      const from = points[low]!;
      const to = points[low + 1] ?? from;
      expect(Math.abs(from + (to - from) * (at - low) - SpringCurve.easing(progress))).toBeLessThan(
        0.005,
      );
    }
  });
});
