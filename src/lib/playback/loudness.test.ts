import { describe, expect, it } from "vitest";
import { Loudness } from "./loudness";

describe("Loudness.smooth", () => {
  it("rises faster than it falls", () => {
    const rise = Loudness.smooth(0, 1, 80);
    const fall = 1 - Loudness.smooth(1, 0, 80);
    expect(rise).toBeGreaterThan(fall);
  });

  it("reaches about 63% of the way in one time constant", () => {
    expect(Loudness.smooth(0, 1, Loudness.ATTACK_MS)).toBeCloseTo(0.632, 2);
    expect(1 - Loudness.smooth(1, 0, Loudness.RELEASE_MS)).toBeCloseTo(0.632, 2);
  });

  it("stays put with no time passing", () => {
    expect(Loudness.smooth(0.3, 1, 0)).toBe(0.3);
  });
});

describe("Loudness.keyframes", () => {
  it("is empty without a waveform or a duration", () => {
    expect(Loudness.keyframes(null, 4000)).toEqual([]);
    expect(Loudness.keyframes([], 4000)).toEqual([]);
    expect(Loudness.keyframes([255, 255], null)).toEqual([]);
    expect(Loudness.keyframes([255, 255], 0)).toEqual([]);
  });

  it("makes one keyframe per bucket, evenly spread over the track", () => {
    const keyframes = Loudness.keyframes([0, 0, 0, 0], 4000);
    expect(keyframes.map((keyframe) => keyframe.atMs)).toEqual([0, 1000, 2000, 3000]);
  });

  it("starts at the first bucket and then follows the smoothing forward in time", () => {
    const rms = [255, 255, 0, 0];
    const keyframes = Loudness.keyframes(rms, 4000);
    expect(keyframes[0]?.level).toBe(0);
    const rise = Loudness.smooth(0, 1, 1000);
    expect(keyframes[1]?.level).toBeCloseTo(rise, 6);
    expect(keyframes[2]?.level).toBeCloseTo(Loudness.smooth(rise, 0, 1000), 6);
  });

  it("rises faster than it falls", () => {
    const keyframes = Loudness.keyframes([255, 255, 255, 0, 0, 0], 6000);
    const peak = keyframes[2]!.level;
    expect(peak - keyframes[0]!.level).toBeGreaterThan(peak - keyframes[5]!.level);
  });
});
