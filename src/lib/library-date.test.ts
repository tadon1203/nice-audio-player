import { describe, expect, it } from "vitest";
import { formatLibraryDate } from "./library-date";

describe("formatLibraryDate", () => {
  it.each([
    ["2000-09-27T09:00:00", "2000"],
    ["2000-09-27", "2000"],
    ["2000", "2000"],
    [" unknown ", "unknown"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatLibraryDate(value)).toBe(expected);
  });
});
