import { describe, expect, it } from "vitest";
import { sortIndexLetter } from "./sort-index";

describe("sortIndexLetter", () => {
  it("uppercases Latin letters and drops accents", () => {
    expect(sortIndexLetter("abbey road")).toBe("A");
    expect(sortIndexLetter("Épique")).toBe("E");
  });

  it("uses the head of the kana row, for hiragana and katakana alike", () => {
    expect(sortIndexLetter("がっこう")).toBe("か");
    expect(sortIndexLetter("ガッコウ")).toBe("か");
    expect(sortIndexLetter("そら")).toBe("さ");
    expect(sortIndexLetter("ンー")).toBe("わ");
  });

  it("groups digits and symbols", () => {
    expect(sortIndexLetter("1999")).toBe("#");
    expect(sortIndexLetter("(untitled)")).toBe("#");
    expect(sortIndexLetter("")).toBe("#");
  });

  it("keeps kanji as they are", () => {
    expect(sortIndexLetter("宇多田")).toBe("宇");
  });
});
