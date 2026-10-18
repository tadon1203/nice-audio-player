import { describe, expect, it } from "vitest";
import { RollingDigit } from "./rolling-digit";
import { RollingMath } from "./rolling-math";

const LAPS = RollingMath.LAPS;

describe("RollingDigit.landingFrom", () => {
  it("lands on the next digit going forward, through the wrap", () => {
    expect(new RollingDigit(0, "up", 0).landingFrom(39)).toBe(40);
    expect(new RollingDigit(7, "up", 0).landingFrom(33)).toBe(37);
  });

  it("lands on the next digit going back, through the wrap", () => {
    expect(new RollingDigit(9, "down", 0).landingFrom(30)).toBe(29);
    expect(new RollingDigit(3, "down", 0).landingFrom(37)).toBe(33);
  });

  it("adds whole laps for a spin, capped at two", () => {
    expect(new RollingDigit(7, "up", 1).landingFrom(33)).toBe(47);
    expect(new RollingDigit(3, "down", 5).landingFrom(37)).toBe(13);
  });

  it("stays on the same digit when nothing changes and there is no spin", () => {
    expect(new RollingDigit(4, "up", 0).landingFrom(34)).toBe(34);
    expect(new RollingDigit(4, "down", 0).landingFrom(34)).toBe(34);
  });

  it("stays inside the column from the home lap", () => {
    for (let d = 0; d < RollingMath.LAP; d++) {
      for (const way of ["up", "down"] as const) {
        const t = new RollingDigit(d, way, 2).landingFrom(30 + 5);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(LAPS * RollingMath.LAP);
      }
    }
  });
});
