import { describe, expect, it } from "vitest";
import { cssMotionFor } from "./css-motion";

describe("cssMotionFor", () => {
  it("gives the token's duration and the shared ease-out", () => {
    expect(cssMotionFor("move", false)).toEqual({
      duration: "300ms",
      easing: "cubic-bezier(0.33, 1, 0.68, 1)",
    });
  });

  it("is the 100ms crossfade for every token under reduced motion", () => {
    expect(cssMotionFor("large", true).duration).toBe("100ms");
  });
});
