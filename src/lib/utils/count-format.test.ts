import { describe, expect, it } from "vitest";
import { CountFormat } from "./count-format";
import { MISSING } from "./missing";

describe("CountFormat.number", () => {
  it("groups digits and marks unknown values", () => {
    expect(CountFormat.number(1234)).toBe((1234).toLocaleString());
    expect(CountFormat.number(0)).toBe("0");
    expect(CountFormat.number(undefined)).toBe(MISSING);
  });
});

describe("CountFormat.count", () => {
  it("uses the singular only for exactly one", () => {
    expect(CountFormat.count(1, "album")).toBe("1 album");
    expect(CountFormat.count(0, "album")).toBe("0 albums");
    expect(CountFormat.count(2, "album")).toBe("2 albums");
  });

  it("supports irregular plurals and unknown counts", () => {
    expect(CountFormat.count(2, "album artist", "album artists")).toBe("2 album artists");
    expect(CountFormat.count(null, "track")).toBe(`${MISSING} tracks`);
  });
});

describe("CountFormat.ofTotal", () => {
  it("formats a number with an optional total", () => {
    expect(CountFormat.ofTotal(null, 12)).toBeNull();
    expect(CountFormat.ofTotal(3, null)).toBe("3");
    expect(CountFormat.ofTotal(3, 12)).toBe("3 of 12");
  });
});
