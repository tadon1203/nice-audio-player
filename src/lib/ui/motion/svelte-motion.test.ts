import { describe, expect, it } from "vitest";
import { motionFor } from "./svelte-motion";
import { motionTokens } from "./tokens";

describe("motionFor", () => {
  it("turns a spring into an easing that starts at 0, ends at 1 and never overshoots", () => {
    const { easing, duration } = motionFor("mediumMove", false);
    expect(duration).toBeGreaterThanOrEqual(motionTokens.mediumMove.visualDuration * 1000);
    expect(easing(0)).toBe(0);
    expect(easing(1)).toBe(1);
    for (let t = 0; t <= 1; t += 0.05) expect(easing(t)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("makes every token the same 100ms crossfade under reduced motion", () => {
    for (const token of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
      expect(motionFor(token, true)).toBe(motionFor("smallMove", true));
    }
    expect(motionFor("largeMove", true).duration).toBe(100);
  });
});
