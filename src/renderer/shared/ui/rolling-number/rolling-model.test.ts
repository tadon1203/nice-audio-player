import { describe, expect, it } from "vitest";
import {
  COLUMN_LAPS,
  resolveDirection,
  rollDelta,
  rollTarget,
  settleDelay,
  spinTurns,
} from "./rolling-model";

describe("rollDelta", () => {
  it("rolls up through the wrap", () => {
    expect(rollDelta(9, 0, "up")).toBe(1);
    expect(rollDelta(3, 7, "up")).toBe(4);
  });

  it("rolls down through the wrap as a negative step", () => {
    expect(rollDelta(0, 9, "down")).toBe(-1);
    expect(rollDelta(7, 3, "down")).toBe(-4);
  });

  it("does not move when the digit is unchanged", () => {
    expect(rollDelta(4, 4, "up")).toBe(0);
    expect(rollDelta(4, 4, "down")).toBe(0);
  });
});

describe("resolveDirection", () => {
  it("compares the numbers", () => {
    expect(resolveDirection("3:07", "3:08")).toBe("up");
    expect(resolveDirection("3:08", "3:07")).toBe("down");
  });
});

describe("spinTurns", () => {
  it("grows with the distance and stops at 3", () => {
    expect(spinTurns(10_000)).toBe(0);
    expect(spinTurns(-65_000)).toBe(2);
    expect(spinTurns(600_000)).toBe(3);
  });
});

describe("settleDelay", () => {
  it("staggers only for right-last", () => {
    expect(settleDelay(3, "together")).toBe(0);
    expect(settleDelay(3, "right-last")).toBeCloseTo(0.12);
  });
});

describe("rollTarget", () => {
  it("lands on the next digit going forward, through the wrap", () => {
    expect(rollTarget(39, 0, "up", 0)).toBe(40);
    expect(rollTarget(33, 7, "up", 0)).toBe(37);
  });

  it("lands on the next digit going back, through the wrap", () => {
    expect(rollTarget(30, 9, "down", 0)).toBe(29);
    expect(rollTarget(37, 3, "down", 0)).toBe(33);
  });

  it("adds whole laps for a spin, capped at two", () => {
    expect(rollTarget(33, 7, "up", 1)).toBe(47);
    expect(rollTarget(37, 3, "down", 5)).toBe(13);
  });

  it("stays on the same digit when nothing changes and there is no spin", () => {
    expect(rollTarget(34, 4, "up", 0)).toBe(34);
    expect(rollTarget(34, 4, "down", 0)).toBe(34);
  });

  it("stays inside the column from the home lap", () => {
    for (let d = 0; d < 10; d++) {
      for (const direction of ["up", "down"] as const) {
        const t = rollTarget(30 + 5, d, direction, 2);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(COLUMN_LAPS * 10);
      }
    }
  });
});
