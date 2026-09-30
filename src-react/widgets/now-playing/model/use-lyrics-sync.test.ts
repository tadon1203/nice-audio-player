import { describe, expect, it } from "vitest";
import type { LyricsTimedLine } from "@/shared/ipc";
import { findCurrentLineIndex, lineSpan, withIntro } from "./use-lyrics-sync";

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

describe("withIntro", () => {
  it("adds an empty line at 0ms when the first line starts at 3s or later", () => {
    const late: LyricsTimedLine[] = [{ startMs: 3_000, text: "Late" }];
    expect(withIntro(late)).toEqual([
      { startMs: 0, text: "" },
      { startMs: 3_000, text: "Late" },
    ]);
  });

  it("keeps the lines when the first one starts before 3s", () => {
    const early: LyricsTimedLine[] = [{ startMs: 2_999, text: "Early" }];
    expect(withIntro(early)).toBe(early);
  });

  it("keeps an empty list", () => {
    const none: LyricsTimedLine[] = [];
    expect(withIntro(none)).toBe(none);
  });
});
