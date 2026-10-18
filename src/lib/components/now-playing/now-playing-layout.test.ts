import { describe, expect, it } from "vitest";
import { NowPlayingLayout } from "./now-playing-layout";

describe("NowPlayingLayout.waveformHeightFor", () => {
  it("gives way to the content as the layer gets shorter", () => {
    expect(NowPlayingLayout.waveformHeightFor(900)).toBe(96);
    expect(NowPlayingLayout.waveformHeightFor(640)).toBe(96);
    expect(NowPlayingLayout.waveformHeightFor(639)).toBe(72);
    expect(NowPlayingLayout.waveformHeightFor(480)).toBe(72);
    expect(NowPlayingLayout.waveformHeightFor(479)).toBe(56);
  });
});
