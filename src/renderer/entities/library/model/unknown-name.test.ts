import { describe, expect, it } from "vitest";
import { fromNameSegment, toNameSegment } from "./unknown-name";

describe("name segments", () => {
  it.each(["", "Artist", "~", "~tilde", "~~"])("round-trips %j", (name) => {
    expect(fromNameSegment(toNameSegment(name))).toBe(name);
  });

  it("never produces an empty segment", () => {
    expect(toNameSegment("")).not.toBe("");
  });
});
