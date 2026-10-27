import { describe, expect, it } from "vitest";
import { motionTokens } from "./tokens";

describe("motion tokens", () => {
  it("orders the durations from feedback to large", () => {
    expect(motionTokens.feedback.duration).toBeLessThan(motionTokens.move.duration);
    expect(motionTokens.move.duration).toBeLessThan(motionTokens.large.duration);
  });
});
