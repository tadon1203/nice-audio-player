import { describe, expect, it } from "vitest";
import { VolumeStep } from "./volume-step";

describe("VolumeStep.step", () => {
  it("moves by one decibel", () => {
    const quieter = VolumeStep.step(0.5, -1);
    expect(VolumeStep.volumeToDb(quieter)).toBeCloseTo(
      Math.round(VolumeStep.volumeToDb(0.5)) - 1,
      5,
    );
    expect(VolumeStep.volumeToDb(VolumeStep.step(quieter, 1))).toBeCloseTo(
      Math.round(VolumeStep.volumeToDb(0.5)),
      5,
    );
  });

  it("stops at 0 dB", () => {
    expect(VolumeStep.step(1, 1)).toBe(1);
  });

  it("reaches silence below the floor and leaves it upward", () => {
    expect(VolumeStep.step(10 ** (-60 / 20), -1)).toBe(0);
    expect(VolumeStep.step(0, -1)).toBe(0);
    expect(VolumeStep.volumeToDb(VolumeStep.step(0, 1))).toBeCloseTo(-60, 5);
  });
});

describe("VolumeStep.formatDb", () => {
  it("shows silence and muted as negative infinity", () => {
    expect(VolumeStep.formatDb(0, false)).toBe("−∞ dB");
    expect(VolumeStep.formatDb(1, true)).toBe("−∞ dB");
  });

  it("uses a real minus sign", () => {
    expect(VolumeStep.formatDb(0.5, false)).toBe("−6.0 dB");
    expect(VolumeStep.formatDb(1, false)).toBe("0.0 dB");
  });
});

describe("volume slider", () => {
  it("runs in whole decibels from silence to 0 dB", () => {
    expect(VolumeStep.fromSlider(0)).toBe(0);
    expect(VolumeStep.fromSlider(60)).toBe(1);
    expect(VolumeStep.volumeToDb(VolumeStep.fromSlider(30))).toBeCloseTo(-30, 5);
  });

  it("round-trips through the slider", () => {
    for (const position of [0, 1, 17, 42, 60]) {
      expect(VolumeStep.toSlider(VolumeStep.fromSlider(position))).toBe(position);
    }
  });
});
