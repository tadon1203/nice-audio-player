import { describe, expect, it } from "vitest";
import { labelAt, skipTo } from "./scroll-index";

const buckets = [
  { label: "#", count: 2 },
  { label: "A", count: 3 },
  { label: "漢", count: 1 },
];

describe("labelAt", () => {
  it("files each position under the bucket that holds it, in list order", () => {
    expect([0, 1, 2, 4, 5].map((position) => labelAt(buckets, position))).toEqual([
      "#",
      "#",
      "A",
      "A",
      "漢",
    ]);
  });

  it("has no label past the end or without an index", () => {
    expect(labelAt(buckets, 6)).toBeNull();
    expect(labelAt([], 0)).toBeNull();
  });
});

describe("skipTo", () => {
  it("counts the rows before a label", () => {
    expect(skipTo(buckets, "#")).toBe(0);
    expect(skipTo(buckets, "A")).toBe(2);
    expect(skipTo(buckets, "漢")).toBe(5);
  });

  it("is null for a label the list does not have", () => {
    expect(skipTo(buckets, "Z")).toBeNull();
  });
});
