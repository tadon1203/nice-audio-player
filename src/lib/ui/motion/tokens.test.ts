import { describe, expect, it } from "vitest";
import { crossfade, motionTokens, resolveDuration, settle } from "./tokens";

describe("motion tokens", () => {
  it("orders the durations from feedback to large", () => {
    expect(motionTokens.feedback.duration).toBeLessThan(motionTokens.move.duration);
    expect(motionTokens.move.duration).toBeLessThan(motionTokens.large.duration);
  });

  it("turns every token into the same short crossfade under reduced motion", () => {
    for (const token of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
      expect(resolveDuration(token, true)).toBe(crossfade.duration);
      expect(resolveDuration(token, false)).toBe(motionTokens[token].duration);
    }
  });

  it("keeps settle at least critically damped so it never overshoots", () => {
    expect(settle.damping).toBeGreaterThanOrEqual(2 * Math.sqrt(settle.stiffness) - 1e-3);
  });
});
