import { describe, expect, it } from "vitest";
import { ScrollIndex } from "./scroll-index";

const buckets = [
  { label: "#", count: 2 },
  { label: "A", count: 3 },
  { label: "漢", count: 1 },
];

describe("ScrollIndex.labelAt", () => {
  it("files each position under the bucket that holds it, in list order", () => {
    expect([0, 1, 2, 4, 5].map((position) => ScrollIndex.labelAt(buckets, position))).toEqual([
      "#",
      "#",
      "A",
      "A",
      "漢",
    ]);
  });

  it("has no label past the end or without an index", () => {
    expect(ScrollIndex.labelAt(buckets, 6)).toBeNull();
    expect(ScrollIndex.labelAt([], 0)).toBeNull();
  });
});

describe("ScrollIndex.skipTo", () => {
  it("counts the rows before a label", () => {
    expect(ScrollIndex.skipTo(buckets, "#")).toBe(0);
    expect(ScrollIndex.skipTo(buckets, "A")).toBe(2);
    expect(ScrollIndex.skipTo(buckets, "漢")).toBe(5);
  });

  it("is null for a label the list does not have", () => {
    expect(ScrollIndex.skipTo(buckets, "Z")).toBeNull();
  });
});
