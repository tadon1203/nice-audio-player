import { describe, expect, it } from "vitest";
import { GridLayout } from "./grid-layout";

const metrics = { tileWidth: 192, columnGap: 20, tileHeight: 248, rowGap: 32 };

describe("GridLayout.columnCount", () => {
  it("fits as many tiles as the width allows, like auto-fill", () => {
    expect(GridLayout.columnCount(192, metrics)).toBe(1);
    expect(GridLayout.columnCount(403, metrics)).toBe(1);
    expect(GridLayout.columnCount(404, metrics)).toBe(2);
    expect(GridLayout.columnCount(1000, metrics)).toBe(4);
  });

  it("never drops below one column", () => {
    expect(GridLayout.columnCount(0, metrics)).toBe(1);
    expect(GridLayout.columnCount(50, metrics)).toBe(1);
  });
});

describe("GridLayout.rowTop", () => {
  it("places the row of an index at a fixed pitch after the scroll margin", () => {
    expect(GridLayout.rowTop(0, 4, 100, metrics)).toBe(100);
    expect(GridLayout.rowTop(3, 4, 100, metrics)).toBe(100);
    expect(GridLayout.rowTop(4, 4, 100, metrics)).toBe(100 + 280);
    expect(GridLayout.rowTop(9, 4, 0, metrics)).toBe(560);
  });
});

describe("GridLayout.keyTarget", () => {
  const base = { from: 5, columns: 4, count: 20, pageRows: 3 };

  it("moves by one tile or one row", () => {
    expect(GridLayout.keyTarget("ArrowLeft", base)).toBe(4);
    expect(GridLayout.keyTarget("ArrowRight", base)).toBe(6);
    expect(GridLayout.keyTarget("ArrowUp", base)).toBe(1);
    expect(GridLayout.keyTarget("ArrowDown", base)).toBe(9);
  });

  it("moves by a page of rows and to the ends", () => {
    expect(GridLayout.keyTarget("PageDown", base)).toBe(17);
    expect(GridLayout.keyTarget("PageUp", base)).toBe(0);
    expect(GridLayout.keyTarget("Home", base)).toBe(0);
    expect(GridLayout.keyTarget("End", base)).toBe(19);
  });

  it("stays inside the list", () => {
    expect(GridLayout.keyTarget("ArrowLeft", { ...base, from: 0 })).toBe(0);
    expect(GridLayout.keyTarget("ArrowDown", { ...base, from: 18 })).toBe(19);
  });

  it("ignores other keys", () => {
    expect(GridLayout.keyTarget("a", base)).toBeNull();
    expect(GridLayout.keyTarget("Enter", base)).toBeNull();
  });
});

describe("GridLayout.scrollOffsetToReveal", () => {
  it("returns null when the row is fully in view", () => {
    expect(
      GridLayout.scrollOffsetToReveal({ top: 300, height: 248, scrollTop: 200, viewHeight: 600 }),
    ).toBeNull();
  });

  it("scrolls up to a row above the view", () => {
    expect(
      GridLayout.scrollOffsetToReveal({ top: 100, height: 248, scrollTop: 200, viewHeight: 600 }),
    ).toBe(100);
  });

  it("scrolls down to a row below the view", () => {
    expect(
      GridLayout.scrollOffsetToReveal({ top: 700, height: 248, scrollTop: 200, viewHeight: 600 }),
    ).toBe(348);
  });
});
