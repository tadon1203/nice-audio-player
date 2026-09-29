import { describe, expect, it } from "vitest";
import { motionTokens, reducedMotionTransition, resolveTransition } from "./tokens";

describe("motion tokens", () => {
  it("keeps every spring except press fully damped so nothing overshoots", () => {
    for (const [name, transition] of Object.entries(motionTokens)) {
      if ("type" in transition && transition.type === "spring") {
        expect(transition.bounce).toBe(name === "press" ? 0.25 : 0);
      }
    }
  });

  it("orders movement from small to large", () => {
    expect(motionTokens.smallMove.visualDuration).toBeLessThan(
      motionTokens.mediumMove.visualDuration,
    );
    expect(motionTokens.mediumMove.visualDuration).toBeLessThan(
      motionTokens.largeMove.visualDuration,
    );
  });

  it("turns every token into the same short crossfade under reduced motion", () => {
    for (const token of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
      expect(resolveTransition(token, true)).toBe(reducedMotionTransition);
      expect(resolveTransition(token, false)).toBe(motionTokens[token]);
    }
  });
});
