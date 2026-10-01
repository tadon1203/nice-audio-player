import { describe, expect, it } from "vitest";
import { motionTokens, crossfade, resolveTransition } from "./tokens";

describe("motion tokens", () => {
  it("keeps every spring except press fully damped so nothing overshoots", () => {
    for (const [name, transition] of Object.entries(motionTokens)) {
      if (transition.kind === "spring") {
        expect(transition.bounce).toBe(name === "press" ? 0.25 : 0);
      }
    }
  });

  it("makes the reduced-motion crossfade a 100ms tween, not a spring", () => {
    expect(crossfade).toEqual({ kind: "tween", duration: 0.1, ease: "easeOut" });
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
      expect(resolveTransition(token, true)).toBe(crossfade);
      expect(resolveTransition(token, false)).toBe(motionTokens[token]);
    }
  });
});
