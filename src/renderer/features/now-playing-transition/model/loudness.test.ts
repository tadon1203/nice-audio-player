import { describe, expect, it } from "vitest";
import { ATTACK_MS, levelAt, RELEASE_MS, smoothLevel } from "./loudness";

describe("levelAt", () => {
  const peaks = [0, 51, 102, 255];

  it("reads the peak under the position", () => {
    expect(levelAt(peaks, 0, 4000)).toBe(0);
    expect(levelAt(peaks, 1500, 4000)).toBeCloseTo(0.2);
    expect(levelAt(peaks, 4000, 4000)).toBe(1);
  });

  it("is 0 without a waveform or a duration", () => {
    expect(levelAt(null, 100, 4000)).toBe(0);
    expect(levelAt(peaks, 100, null)).toBe(0);
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
