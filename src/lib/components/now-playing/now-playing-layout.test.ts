import { describe, expect, it, vi } from "vitest";

// `svelte/motion` reads `matchMedia` as it loads, and this file only tests pure sizes.
vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));
import { waveformHeightFor } from "./now-playing-layout";

describe("waveformHeightFor", () => {
  it("gives way to the content as the layer gets shorter", () => {
    expect(waveformHeightFor(900)).toBe(96);
    expect(waveformHeightFor(640)).toBe(96);
    expect(waveformHeightFor(639)).toBe(72);
    expect(waveformHeightFor(480)).toBe(72);
    expect(waveformHeightFor(479)).toBe(56);
  });
});
