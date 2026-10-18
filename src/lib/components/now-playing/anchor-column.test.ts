import { describe, expect, it } from "vitest";
import { AnchorColumn } from "./anchor-column";

describe("AnchorColumn.spacers", () => {
  it("splits the height at the anchor line", () => {
    expect(AnchorColumn.spacers(1000)).toEqual({ top: 400, bottom: 600 });
  });

  it("is empty before the column is measured", () => {
    expect(AnchorColumn.spacers(0)).toEqual({ top: 0, bottom: 0 });
  });
});

describe("AnchorColumn.scrollTop", () => {
  const base = { rowHeight: 40, clientHeight: 500, scrollHeight: 2000 };

  it("puts the centre of the row on the anchor line", () => {
    expect(AnchorColumn.scrollTop({ ...base, rowTop: 1000 })).toBe(
      1000 + 20 - 500 * AnchorColumn.fraction,
    );
  });

  it("stays inside the scroll range", () => {
    expect(AnchorColumn.scrollTop({ ...base, rowTop: 0 })).toBe(0);
    expect(AnchorColumn.scrollTop({ ...base, rowTop: 1990 })).toBe(1500);
  });

  it("does not scroll a column shorter than its container", () => {
    expect(
      AnchorColumn.scrollTop({ rowTop: 100, rowHeight: 40, clientHeight: 500, scrollHeight: 300 }),
    ).toBe(0);
  });
});
