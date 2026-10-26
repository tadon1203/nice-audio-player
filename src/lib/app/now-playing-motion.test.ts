import { describe, expect, it } from "vitest";
import { motionTokens } from "#lib/ui/motion/tokens";
import { NowPlayingMotion } from "./now-playing-motion";

describe("NowPlayingMotion.duration", () => {
  it("opens at the large token and closes quicker", () => {
    expect(NowPlayingMotion.duration(true)).toBe(motionTokens.large.duration);
    expect(NowPlayingMotion.duration(false)).toBeLessThan(NowPlayingMotion.duration(true));
  });
});
