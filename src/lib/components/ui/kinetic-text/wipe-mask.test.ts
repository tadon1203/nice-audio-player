import { describe, expect, it } from "vitest";
import { WipeMask } from "./wipe-mask";

describe("WipeMask.at", () => {
  it("opens from the left with a soft edge behind the front", () => {
    expect(WipeMask.at(50)).toBe(
      "linear-gradient(to right, black calc(50% - 20%), transparent 50%)",
    );
  });

  it("ends past the text so the mask clips nothing", () => {
    expect(WipeMask.REVEAL_END_PERCENT).toBe(120);
  });
});
