import { describe, expect, it } from "vitest";
import { RollingMath } from "./rolling-math";

describe("RollingMath.direction", () => {
  it("compares the numbers", () => {
    expect(RollingMath.direction("3:07", "3:08")).toBe("up");
    expect(RollingMath.direction("3:08", "3:07")).toBe("down");
  });
});

describe("RollingMath.spinTurns", () => {
  it("grows with the distance and stops at 3", () => {
    expect(RollingMath.spinTurns(10_000)).toBe(0);
    expect(RollingMath.spinTurns(-65_000)).toBe(2);
    expect(RollingMath.spinTurns(600_000)).toBe(3);
  });
});

describe("RollingMath.settleDelay", () => {
  it("staggers only for right-last", () => {
    expect(RollingMath.settleDelay(3, "together")).toBe(0);
    expect(RollingMath.settleDelay(3, "right-last")).toBeCloseTo(0.12);
  });
});
