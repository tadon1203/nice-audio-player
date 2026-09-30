import { describe, expect, it } from "vitest";
import { graphemes } from "./graphemes";

describe("graphemes", () => {
  it("keeps a combining accent with its base", () => {
    expect(graphemes("éa")).toEqual(["é", "a"]);
  });

  it("keeps an emoji ZWJ sequence whole", () => {
    expect(graphemes("👨‍👩‍👧x")).toEqual(["👨‍👩‍👧", "x"]);
  });

  it("keeps a kana with a combining dakuten whole", () => {
    expect(graphemes("がき")).toEqual(["が", "き"]);
  });

  it("returns nothing for empty text", () => {
    expect(graphemes("")).toEqual([]);
  });
});
