import { describe, expect, it } from "vitest";
import { Waveform } from "./waveform";

describe("Waveform.resampleBars", () => {
  it("merges a span by the root of the mean of its squares", () => {
    const bars = Waveform.resampleBars([6, 8, 0, 0], 2);
    expect(bars[0]).toBeCloseTo(Math.sqrt((36 + 64) / 2));
    expect(bars[1]).toBe(0);
  });

  it("never invents bars beyond the data", () => {
    expect(Waveform.resampleBars([1, 2, 3], 10)).toHaveLength(3);
    expect(Waveform.resampleBars([], 10)).toEqual([]);
  });
});

describe("Waveform.levelToUnit", () => {
  it("maps full scale to 1, silence and the floor to 0", () => {
    expect(Waveform.levelToUnit(255)).toBe(1);
    expect(Waveform.levelToUnit(0)).toBe(0);
    expect(Waveform.levelToUnit(1)).toBe(0);
    expect(Waveform.levelToUnit(128)).toBeCloseTo(1 - 6.02 / 36, 2);
  });
});

describe("Waveform.positionFromOffset", () => {
  it("maps linearly and clamps to the bar", () => {
    expect(Waveform.positionFromOffset(50, 100, 200_000)).toBe(100_000);
    expect(Waveform.positionFromOffset(-20, 100, 200_000)).toBe(0);
    expect(Waveform.positionFromOffset(500, 100, 200_000)).toBe(200_000);
    expect(Waveform.positionFromOffset(10, 0, 200_000)).toBe(0);
  });
});

describe("Waveform.nextSeekPosition", () => {
  it("steps by five seconds within bounds and ignores other keys", () => {
    expect(Waveform.nextSeekPosition("ArrowRight", 1_000, 60_000)).toBe(6_000);
    expect(Waveform.nextSeekPosition("ArrowLeft", 1_000, 60_000)).toBe(0);
    expect(Waveform.nextSeekPosition("End", 1_000, 60_000)).toBe(60_000);
    expect(Waveform.nextSeekPosition("a", 1_000, 60_000)).toBeNull();
  });
});

describe("Waveform.barCountForWidth", () => {
  it("fits at least one bar", () => {
    expect(Waveform.barCountForWidth(0)).toBe(1);
    expect(Waveform.barCountForWidth(300)).toBe(100);
  });
});

describe("scrubbing", () => {
  it("follows the pointer 1:1 on the bar and near it", () => {
    expect(Waveform.scrubGain(0, false)).toBe(1);
    expect(Waveform.scrubGain(Waveform.SCRUB_FREE_PX, false)).toBe(1);
    expect(Waveform.scrubGain(-Waveform.SCRUB_FREE_PX, false)).toBe(1);
  });

  it("slows down further from the bar, symmetrically, down to a floor", () => {
    expect(Waveform.scrubGain(Waveform.SCRUB_FREE_PX + 48, false)).toBeCloseTo(0.5);
    expect(Waveform.scrubGain(-(Waveform.SCRUB_FREE_PX + 96), false)).toBeCloseTo(0.25);
    expect(Waveform.scrubGain(10_000, false)).toBe(Waveform.SCRUB_MIN_GAIN);
  });

  it("slows a further tenfold with Shift", () => {
    expect(Waveform.scrubGain(0, true)).toBeCloseTo(0.1);
  });

  it("moves the position by the gained share of the track and clamps", () => {
    expect(Waveform.scrubPosition(10_000, 100, 1, 1000, 200_000)).toBe(30_000);
    expect(Waveform.scrubPosition(10_000, 100, 0.5, 1000, 200_000)).toBe(20_000);
    expect(Waveform.scrubPosition(10_000, -500, 1, 1000, 200_000)).toBe(0);
    expect(Waveform.scrubPosition(190_000, 500, 1, 1000, 200_000)).toBe(200_000);
  });
});
