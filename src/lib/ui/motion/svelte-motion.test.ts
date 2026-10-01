import { describe, expect, it } from "vitest";
import { motionFor } from "./svelte-motion";
import { motionTokens } from "./tokens";

describe("motionFor", () => {
  it("gives each token its duration and an easing that runs from 0 to 1", () => {
    for (const token of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
      const { easing, duration } = motionFor(token, false);
      expect(duration).toBe(motionTokens[token].duration);
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
    }
  });

  it("makes every token the same 100ms crossfade under reduced motion", () => {
    for (const token of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
      expect(motionFor(token, true).duration).toBe(100);
    }
  });
});
