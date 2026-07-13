import { describe, expect, it } from "vitest";

import { clamp } from "./math";

describe("clamp", () => {
  it("returns the minimum when value is too small", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
  });

  it("returns the maximum when value is too large", () => {
    expect(clamp(2, 0, 1)).toBe(1);
  });

  it("returns the original value when it is in range", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
