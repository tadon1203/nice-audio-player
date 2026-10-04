import { describe, expect, it } from "vitest";
import { ATTACK_MS, loudnessKeyframes, RELEASE_MS, smoothLevel } from "./loudness";

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

describe("loudnessKeyframes", () => {
  it("is empty without a waveform or a duration", () => {
    expect(loudnessKeyframes(null, 4000)).toEqual([]);
    expect(loudnessKeyframes([], 4000)).toEqual([]);
    expect(loudnessKeyframes([255, 255], null)).toEqual([]);
    expect(loudnessKeyframes([255, 255], 0)).toEqual([]);
  });

  it("makes one keyframe per bucket, evenly spread over the track", () => {
    const keyframes = loudnessKeyframes([0, 0, 0, 0], 4000);
    expect(keyframes.map((keyframe) => keyframe.atMs)).toEqual([0, 1000, 2000, 3000]);
  });

  it("starts at the first bucket and then follows the smoothing forward in time", () => {
    const rms = [255, 255, 0, 0];
    const keyframes = loudnessKeyframes(rms, 4000);
    expect(keyframes[0]?.level).toBe(0);
    const rise = smoothLevel(0, 1, 1000);
    expect(keyframes[1]?.level).toBeCloseTo(rise, 6);
    expect(keyframes[2]?.level).toBeCloseTo(smoothLevel(rise, 0, 1000), 6);
  });

  it("rises faster than it falls", () => {
    const keyframes = loudnessKeyframes([255, 255, 255, 0, 0, 0], 6000);
    const peak = keyframes[2]!.level;
    expect(peak - keyframes[0]!.level).toBeGreaterThan(peak - keyframes[5]!.level);
  });
});
