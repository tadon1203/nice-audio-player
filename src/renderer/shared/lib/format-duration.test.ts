import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("formats null and sub-hour durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(125_000)).toBe("2:05");
  });

  it("includes hours without dropping zero padding", () => {
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
});
