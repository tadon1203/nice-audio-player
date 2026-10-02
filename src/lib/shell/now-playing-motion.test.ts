import { describe, expect, it } from "vitest";
import { motionTokens } from "$lib/ui/motion/tokens";
import { nowPlayingDuration } from "./now-playing-motion";

describe("nowPlayingDuration", () => {
  it("opens at the large token and closes quicker", () => {
    expect(nowPlayingDuration(true)).toBe(motionTokens.large.duration);
    expect(nowPlayingDuration(false)).toBeLessThan(nowPlayingDuration(true));
  });
});
