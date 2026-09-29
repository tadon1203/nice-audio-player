import { describe, expect, it } from "vitest";
import { dropSlot, slotToIndex } from "./queue-drag";

describe("dropSlot", () => {
  const midpoints = [10, 30, 50];

  it("picks the gap the pointer is in", () => {
    expect(dropSlot(midpoints, 0)).toBe(0);
    expect(dropSlot(midpoints, 20)).toBe(1);
    expect(dropSlot(midpoints, 40)).toBe(2);
    expect(dropSlot(midpoints, 99)).toBe(3);
  });

  it("has a single slot for an empty list", () => {
    expect(dropSlot([], 5)).toBe(0);
  });
});

describe("slotToIndex", () => {
  it("keeps the slot when moving earlier", () => {
    expect(slotToIndex(0, 2)).toBe(0);
    expect(slotToIndex(1, 2)).toBe(1);
  });

  it("shifts down by one when moving later, since the item leaves its old place first", () => {
    expect(slotToIndex(3, 0)).toBe(2);
    expect(slotToIndex(2, 0)).toBe(1);
  });

  it("returns the same index for the slots on either side of the item", () => {
    expect(slotToIndex(1, 1)).toBe(1);
    expect(slotToIndex(2, 1)).toBe(1);
  });
});
