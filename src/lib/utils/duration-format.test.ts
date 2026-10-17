import { describe, expect, it } from "vitest";
import { DurationFormat } from "./duration-format";
import { MISSING } from "./missing";

describe("DurationFormat.of", () => {
  it("formats null and sub-hour durations", () => {
    expect(DurationFormat.of(null)).toBe(MISSING);
    expect(DurationFormat.of(125_000)).toBe("2:05");
  });

  it("includes hours without dropping zero padding", () => {
    expect(DurationFormat.of(3_723_000)).toBe("1:02:03");
  });
});
