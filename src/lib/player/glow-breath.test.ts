import { describe, expect, it } from "vitest";
import { glowOpacityAt, loudnessKeyframes, smoothLoudness } from "./glow-breath";

describe("smoothLoudness", () => {
  it("rises faster than it falls", () => {
    const rise = smoothLoudness(0, 1, 700);
    const fall = smoothLoudness(1, 0, 700);
    expect(1 - fall).toBeLessThan(rise);
  });

  it("holds still with no time passed", () => {
    expect(smoothLoudness(0.3, 1, 0)).toBe(0.3);
  });
});

describe("loudnessKeyframes", () => {
  it("has one keyframe per bucket, each at the bucket's start", () => {
    const keyframes = loudnessKeyframes([255, 255, 255, 255], 4_000);
    expect(keyframes.map((keyframe) => keyframe.atMs)).toEqual([0, 1_000, 2_000, 3_000]);
  });

  it("is empty without a waveform or a duration", () => {
    expect(loudnessKeyframes(null, 1_000)).toEqual([]);
    expect(loudnessKeyframes([1], null)).toEqual([]);
  });
});

describe("glowOpacityAt", () => {
  const keyframes = [
    { atMs: 0, opacity: 0 },
    { atMs: 1_000, opacity: 1 },
  ];

  it("interpolates linearly between keyframes", () => {
    expect(glowOpacityAt(keyframes, 250)).toBeCloseTo(0.25);
  });

  it("holds the ends outside the curve", () => {
    expect(glowOpacityAt(keyframes, -10)).toBe(0);
    expect(glowOpacityAt(keyframes, 5_000)).toBe(1);
  });
});
