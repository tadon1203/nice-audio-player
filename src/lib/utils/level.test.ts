import { describe, expect, it } from "vitest";
import { levelToUnit } from "./level";

describe("levelToUnit", () => {
  it("maps full scale to 1, silence and the floor to 0", () => {
    expect(levelToUnit(255)).toBe(1);
    expect(levelToUnit(0)).toBe(0);
    expect(levelToUnit(1)).toBe(0);
    expect(levelToUnit(128)).toBeCloseTo(1 - 6.02 / 36, 2);
  });
});
