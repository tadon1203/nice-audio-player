import { describe, expect, it } from "vitest";
import { ATTACK_MS, levelAt, RELEASE_MS, smoothLevel } from "./loudness";

describe("levelAt", () => {
  const rms = [0, 51, 102, 255];

  it("reads the level under the position on the waveform's dB scale", () => {
    expect(levelAt(rms, 0, 4000)).toBe(0);
    expect(levelAt(rms, 1500, 4000)).toBeCloseTo(1 - 13.98 / 36, 2);
    expect(levelAt(rms, 4000, 4000)).toBe(1);
  });

  it("is 0 without a waveform or a duration", () => {
    expect(levelAt(null, 100, 4000)).toBe(0);
    expect(levelAt(rms, 100, null)).toBe(0);
    expect(levelAt([], 100, 4000)).toBe(0);
  });
});

describe("smoothLevel", () => {
  it("rises faster than it falls", () => {
    const rise = smoothLevel(0, 1, 80);
    const fall = 1 - smoothLevel(1, 0, 80);
    expect(rise).toBeGreaterThan(fall);
  });

  it("reaches about 63% of the way in one time constant", () => {
    expect(smoothLevel(0, 1, ATTACK_MS)).toBeCloseTo(0.632, 2);
    expect(1 - smoothLevel(1, 0, RELEASE_MS)).toBeCloseTo(0.632, 2);
  });

  it("stays put with no time passing", () => {
    expect(smoothLevel(0.3, 1, 0)).toBe(0.3);
  });
});
