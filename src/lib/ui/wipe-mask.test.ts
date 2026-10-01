import { describe, expect, it } from "vitest";
import { REVEAL_END_PERCENT, wipeMask } from "./wipe-mask";

describe("wipeMask", () => {
  it("opens from the left with a soft edge behind the front", () => {
    expect(wipeMask(50)).toBe("linear-gradient(to right, black calc(50% - 20%), transparent 50%)");
  });

  it("ends past the text so the mask clips nothing", () => {
    expect(REVEAL_END_PERCENT).toBe(120);
  });
});
