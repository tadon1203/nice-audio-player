import { describe, expect, it } from "vitest";
import { cssMotionFor } from "./css-motion";

describe("cssMotionFor", () => {
  it("turns a spring into a linear() easing that starts at 0 and ends at 1", () => {
    const { easing, duration } = cssMotionFor("feedback", false);
    expect(easing).toMatch(/^linear\(0, .*, 1\)$/);
    expect(parseInt(duration)).toBeGreaterThanOrEqual(100);
  });

  it("is the 100ms crossfade for every token under reduced motion", () => {
    expect(cssMotionFor("smallMove", true)).toEqual({ duration: "100ms", easing: "ease-out" });
  });
});
