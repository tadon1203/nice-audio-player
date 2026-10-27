import { describe, expect, it } from "vitest";
import { barCountForWidth, resampleBars } from "./waveform";

describe("resampleBars", () => {
  it("merges a span by the root of the mean of its squares", () => {
    const bars = resampleBars([6, 8, 0, 0], 2);
    expect(bars[0]).toBeCloseTo(Math.sqrt((36 + 64) / 2));
    expect(bars[1]).toBe(0);
  });

  it("never invents bars beyond the data", () => {
    expect(resampleBars([1, 2, 3], 10)).toHaveLength(3);
    expect(resampleBars([], 10)).toEqual([]);
  });
});

describe("barCountForWidth", () => {
  it("fits at least one bar", () => {
    expect(barCountForWidth(0)).toBe(1);
    expect(barCountForWidth(300)).toBe(100);
  });
});
