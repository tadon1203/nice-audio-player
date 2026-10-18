import { describe, expect, it } from "vitest";
import { GLOW, type GlowStrength } from "./glow";
import { GlowOpacity } from "./glow-opacity";

describe("breathing glow", () => {
  it.each(Object.keys(GLOW.strength) as GlowStrength[])(
    "never gets brighter than the %s strength, so the contrast caps still hold",
    (strength) => {
      for (const level of [-1, 0, 0.5, 1, 4]) {
        expect(GlowOpacity.breathing(strength, level)).toBeLessThanOrEqual(GLOW.strength[strength]);
      }
      expect(GlowOpacity.breathing(strength, 1)).toBeCloseTo(GLOW.strength[strength]);
      expect(GlowOpacity.breathing(strength, 0)).toBeCloseTo(GLOW.strength[strength] * 0.85);
    },
  );

  it("keeps text readable over the faint glow used behind library tiles", () => {
    // Faint is dimmer than max, so the max worst case (tested in glow-contrast.test.ts) bounds it.
    expect(GLOW.strength.faint).toBeLessThan(GLOW.strength.max);
  });
});
