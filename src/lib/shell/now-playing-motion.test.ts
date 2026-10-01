import { describe, expect, it } from "vitest";
import { nowPlayingSpring } from "./now-playing-motion";

describe("nowPlayingSpring", () => {
  it("is quicker when closing and fully damped either way", () => {
    const open = nowPlayingSpring(true);
    const close = nowPlayingSpring(false);
    expect(close.stiffness).toBeGreaterThan(open.stiffness);
    for (const { stiffness, damping } of [open, close]) {
      expect(damping).toBeGreaterThanOrEqual(2 * Math.sqrt(stiffness) - 1e-3);
      expect(damping).toBeLessThanOrEqual(1);
    }
  });
});
