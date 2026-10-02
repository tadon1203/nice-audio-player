import { describe, expect, it } from "vitest";
import {
  ANCHOR_FRACTION,
  DISTANCE_OPACITY,
  anchorScrollTop,
  anchorSpacers,
  opacityAtDistance,
} from "./anchor-column";

describe("anchorSpacers", () => {
  it("splits the height at the anchor line", () => {
    expect(anchorSpacers(1000)).toEqual({ top: 400, bottom: 600 });
  });

  it("is empty before the column is measured", () => {
    expect(anchorSpacers(0)).toEqual({ top: 0, bottom: 0 });
  });
});

describe("anchorScrollTop", () => {
  const base = { rowHeight: 40, clientHeight: 500, scrollHeight: 2000 };

  it("puts the centre of the row on the anchor line", () => {
    expect(anchorScrollTop({ ...base, rowTop: 1000 })).toBe(1000 + 20 - 500 * ANCHOR_FRACTION);
  });

  it("stays inside the scroll range", () => {
    expect(anchorScrollTop({ ...base, rowTop: 0 })).toBe(0);
    expect(anchorScrollTop({ ...base, rowTop: 1990 })).toBe(1500);
  });

  it("does not scroll a column shorter than its container", () => {
    expect(
      anchorScrollTop({ rowTop: 100, rowHeight: 40, clientHeight: 500, scrollHeight: 300 }),
    ).toBe(0);
  });
});

describe("opacityAtDistance", () => {
  it("fades with the distance from the current row", () => {
    expect(opacityAtDistance(0)).toBe(1);
    expect(opacityAtDistance(2)).toBe(0.7);
  });

  it("holds the last step beyond the table and clamps negatives", () => {
    expect(opacityAtDistance(99)).toBe(DISTANCE_OPACITY.at(-1));
    expect(opacityAtDistance(-3)).toBe(1);
  });
});
