import { describe, expect, it } from "vitest";
import { TrackDiscs } from "./track-discs";

describe("TrackDiscs", () => {
  const discs = (...numbers: (number | null)[]): { discNumber: number | null }[] =>
    numbers.map((discNumber) => ({ discNumber }));

  it("split an album on several discs where each disc begins", () => {
    const rows = discs(1, 1, 2, 2);
    expect(TrackDiscs.hasSeveral(rows)).toBe(true);
    expect(rows.map((_, index) => TrackDiscs.starts(rows, index))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("add nothing to a single disc or to tracks without a disc number", () => {
    expect(TrackDiscs.hasSeveral(discs(1, 1))).toBe(false);
    expect(TrackDiscs.hasSeveral(discs(null, null))).toBe(false);
  });
});
