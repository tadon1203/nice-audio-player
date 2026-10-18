import { describe, expect, it } from "vitest";
import { DropSlot } from "./drop-slot";

describe("DropSlot.toIndex", () => {
  it("keeps the slot when moving earlier", () => {
    expect(DropSlot.toIndex(0, 2)).toBe(0);
    expect(DropSlot.toIndex(1, 2)).toBe(1);
  });

  it("shifts down by one when moving later, since the item leaves its old place first", () => {
    expect(DropSlot.toIndex(3, 0)).toBe(2);
    expect(DropSlot.toIndex(2, 0)).toBe(1);
  });

  it("returns the same index for the slots on either side of the item", () => {
    expect(DropSlot.toIndex(1, 1)).toBe(1);
    expect(DropSlot.toIndex(2, 1)).toBe(1);
  });
});

describe("DropSlot.ofFixedRows", () => {
  // Four rows of height 20: row centres sit at 10, 30, 50 and 70. A pointer above a centre drops
  // the row before it, so the slot is the number of centres above the pointer.
  it("picks the gap the pointer is in, clamped to the list", () => {
    const cases: [offsetY: number, slot: number][] = [
      [-5, 0],
      [0, 0],
      [9, 0],
      [11, 1],
      [29, 1],
      [31, 2],
      [55, 3],
      [70, 3],
      [79, 4],
      [200, 4],
    ];
    for (const [y, slot] of cases) {
      expect(DropSlot.ofFixedRows(y, 20, 4)).toBe(slot);
    }
  });

  it("has a single slot for an empty list and no slot for an unknown height", () => {
    expect(DropSlot.ofFixedRows(5, 20, 0)).toBe(0);
    expect(DropSlot.ofFixedRows(5, 0, 4)).toBe(0);
  });
});
