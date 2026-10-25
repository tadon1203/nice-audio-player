import { describe, expect, it } from "vitest";
import { type LetterIndexEntry } from "#lib/native/bindings";
import { labelAt, skipTo } from "./letter-index";

const entries: LetterIndexEntry[] = [
  { label: "#", kind: "letter", start: 0, count: 2 },
  { label: "A", kind: "letter", start: 2, count: 3 },
  { label: "漢", kind: "kanji", start: 5, count: 1 },
];

describe("labelAt", () => {
  it("files each position under the entry that holds it, in list order", () => {
    expect([0, 1, 2, 4, 5].map((position) => labelAt(entries, position))).toEqual([
      "#",
      "#",
      "A",
      "A",
      "漢",
    ]);
  });

  it("has no label past the end or without an index", () => {
    expect(labelAt(entries, 6)).toBeNull();
    expect(labelAt([], 0)).toBeNull();
  });
});

describe("skipTo", () => {
  it("is the row a label's entry starts at", () => {
    expect(skipTo(entries, "#")).toBe(0);
    expect(skipTo(entries, "A")).toBe(2);
    expect(skipTo(entries, "漢")).toBe(5);
  });

  it("is null for a label the list does not have", () => {
    expect(skipTo(entries, "Z")).toBeNull();
  });
});
