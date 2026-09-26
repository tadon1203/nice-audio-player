import { describe, expect, it } from "vitest";
import { MISSING, formatCount, formatDuration, formatNumber, formatSampleRate } from "./format";

describe("formatDuration", () => {
  it("formats null and sub-hour durations", () => {
    expect(formatDuration(null)).toBe(MISSING);
    expect(formatDuration(125_000)).toBe("2:05");
  });

  it("includes hours without dropping zero padding", () => {
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
});

describe("formatSampleRate", () => {
  it("formats hertz as kHz and marks unknown values", () => {
    expect(formatSampleRate(44_100)).toBe("44.1 kHz");
    expect(formatSampleRate(null)).toBe(MISSING);
    expect(formatSampleRate(Number.NaN)).toBe(MISSING);
  });
});

describe("formatNumber", () => {
  it("groups digits and marks unknown values", () => {
    expect(formatNumber(1234)).toBe((1234).toLocaleString());
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(undefined)).toBe(MISSING);
  });
});

describe("formatCount", () => {
  it("uses the singular only for exactly one", () => {
    expect(formatCount(1, "album")).toBe("1 album");
    expect(formatCount(0, "album")).toBe("0 albums");
    expect(formatCount(2, "album")).toBe("2 albums");
  });

  it("supports irregular plurals and unknown counts", () => {
    expect(formatCount(2, "album artist", "album artists")).toBe("2 album artists");
    expect(formatCount(null, "track")).toBe(`${MISSING} tracks`);
  });
});
