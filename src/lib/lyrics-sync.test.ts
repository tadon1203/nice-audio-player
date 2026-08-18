import { describe, expect, it } from "vitest";
import { activeLyricsGroup } from "./lyrics-sync";

const lines = [
  { startMs: 1_000, text: "One" },
  { startMs: 2_000, text: "Two" },
  { startMs: 2_000, text: "Deux" },
  { startMs: 3_000, text: "" },
  { startMs: 4_000, text: "Four" },
];

describe("activeLyricsGroup", () => {
  it("finds the last cue at or before the authoritative position", () => {
    expect(activeLyricsGroup(lines, 999)).toBeNull();
    expect(activeLyricsGroup(lines, 2_500)).toMatchObject({ indices: [1, 2], clears: false });
    expect(activeLyricsGroup(lines, 3_000)).toMatchObject({ indices: [3], clears: true });
    expect(activeLyricsGroup(lines, 9_000)).toMatchObject({ indices: [4], clears: false });
    expect(activeLyricsGroup(lines, 2_500)).toMatchObject({ ordinal: 1 });
    expect(activeLyricsGroup(lines, 4_000)).toMatchObject({ ordinal: 3 });
  });
});
