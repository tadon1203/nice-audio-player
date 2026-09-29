import { describe, expect, it } from "vitest";
import type { LyricsTimedLine } from "@/shared/ipc";
import {
  charLift,
  charOpacity,
  findCurrentLineIndex,
  lineFillMs,
  lineProgress,
  lineSpan,
} from "./use-lyrics-sync";

const lines: LyricsTimedLine[] = [
  { startMs: 0, text: "First line" },
  { startMs: 5_000, text: "Second line" },
  { startMs: 12_000, text: "Third line" },
];

describe("findCurrentLineIndex", () => {
  it("returns -1 before the first line starts", () => {
    expect(findCurrentLineIndex(lines, -1)).toBe(-1);
  });

  it("returns the last line whose start is at or before the position", () => {
    expect(findCurrentLineIndex(lines, 0)).toBe(0);
    expect(findCurrentLineIndex(lines, 4_999)).toBe(0);
    expect(findCurrentLineIndex(lines, 5_000)).toBe(1);
    expect(findCurrentLineIndex(lines, 11_999)).toBe(1);
    expect(findCurrentLineIndex(lines, 12_000)).toBe(2);
    expect(findCurrentLineIndex(lines, 999_999)).toBe(2);
  });

  it("returns -1 for an empty line list", () => {
    expect(findCurrentLineIndex([], 1_000)).toBe(-1);
  });
});

describe("lineSpan", () => {
  it("ends at the next line's start", () => {
    expect(lineSpan(lines, 0, null)).toEqual({ startMs: 0, endMs: 5_000 });
    expect(lineSpan(lines, 1, null)).toEqual({ startMs: 5_000, endMs: 12_000 });
  });

  it("ends at the track duration for the last line", () => {
    expect(lineSpan(lines, 2, 180_000)).toEqual({ startMs: 12_000, endMs: 180_000 });
  });

  it("falls back to its own start when the last line has no duration", () => {
    expect(lineSpan(lines, 2, null)).toEqual({ startMs: 12_000, endMs: 12_000 });
  });

  it("returns null for an out-of-range index", () => {
    expect(lineSpan(lines, -1, null)).toBeNull();
    expect(lineSpan(lines, 3, null)).toBeNull();
  });
});

describe("lineProgress", () => {
  it("is unlit before the line, lit after it, and linear in between", () => {
    expect(lineProgress(4_000, 5_000, 2_000)).toBe(0);
    expect(lineProgress(6_000, 5_000, 2_000)).toBe(0.5);
    expect(lineProgress(9_000, 5_000, 2_000)).toBe(1);
  });

  it("lights a line with no length at once", () => {
    expect(lineProgress(4_999, 5_000, 0)).toBe(0);
    expect(lineProgress(5_000, 5_000, 0)).toBe(1);
  });
});

describe("lineFillMs", () => {
  it("fills over the whole line when it is short enough to read at that pace", () => {
    expect(lineFillMs(2_500, "Hi")).toBe(2_300);
    expect(lineFillMs(2_100, "Hello there")).toBe(2_100);
  });

  it("does not crawl through a long gap after the line", () => {
    expect(lineFillMs(30_000, "Hello")).toBe(2_750);
  });

  it("is zero for a line with no length", () => {
    expect(lineFillMs(0, "x")).toBe(0);
  });
});

describe("charOpacity", () => {
  it("lights characters in order, so a wrapped line fills top to bottom", () => {
    const opacities = [0, 1, 2, 3].map((i) => charOpacity(0.5, i, 4));
    expect(opacities).toEqual([1, 1, 0, 0]);
  });

  it("fades the character being sung", () => {
    expect(charOpacity(0.375, 1, 4)).toBeCloseTo(0.5);
  });

  it("is fully lit at the end and dark at the start", () => {
    expect(charOpacity(0, 0, 4)).toBe(0);
    expect(charOpacity(1, 3, 4)).toBe(1);
  });
});

describe("charLift", () => {
  it("does nothing before a character lights", () => {
    expect(charLift(0.1, 3, 4, 4_000)).toBe(0);
  });

  it("rises as it lights and settles within 200ms", () => {
    expect(charLift(0.2501, 1, 4, 4_000)).toBeLessThan(-1.9);
    expect(charLift(0.31, 1, 4, 4_000)).toBe(0);
  });
});
