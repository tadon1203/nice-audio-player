import { describe, expect, it } from "vitest";
import { formatVolumeDb, stepVolumeDb, volumeToDb } from "./volume-step";

describe("stepVolumeDb", () => {
  it("moves by one decibel", () => {
    const quieter = stepVolumeDb(0.5, -1);
    expect(volumeToDb(quieter)).toBeCloseTo(Math.round(volumeToDb(0.5)) - 1, 5);
    expect(volumeToDb(stepVolumeDb(quieter, 1))).toBeCloseTo(Math.round(volumeToDb(0.5)), 5);
  });

  it("stops at 0 dB", () => {
    expect(stepVolumeDb(1, 1)).toBe(1);
  });

  it("reaches silence below the floor and leaves it upward", () => {
    expect(stepVolumeDb(10 ** (-60 / 20), -1)).toBe(0);
    expect(stepVolumeDb(0, -1)).toBe(0);
    expect(volumeToDb(stepVolumeDb(0, 1))).toBeCloseTo(-60, 5);
  });
});

describe("formatVolumeDb", () => {
  it("shows silence and muted as negative infinity", () => {
    expect(formatVolumeDb(0, false)).toBe("−∞ dB");
    expect(formatVolumeDb(1, true)).toBe("−∞ dB");
  });

  it("uses a real minus sign", () => {
    expect(formatVolumeDb(0.5, false)).toBe("−6.0 dB");
    expect(formatVolumeDb(1, false)).toBe("0.0 dB");
  });
});
