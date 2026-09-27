import { describe, expect, it } from "vitest";
import { LIGHT } from "./light-model";

// Neutral OKLCH grays have relative luminance Y = L^3. Values mirror styles.css.
const luminance = (oklchLightness: number) => oklchLightness ** 3;
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toSrgb = (y: number) => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
const fromSrgb = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const background = 0.145;
const ink = { one: 0.985, two: 0.708, three: 0.6 };

/** Luminance of the brightest possible Light (pure white artwork) after the veil. */
function worstCaseSurfaceLuminance() {
  const base = toSrgb(luminance(background));
  // Pure white artwork after `brightness()`. CSS blends in gamma-encoded sRGB: the artwork
  // over the base at `strength`, then the veil over that.
  const artwork = Math.min(1, LIGHT.brightness);
  const withArtwork = base * (1 - LIGHT.strength.max) + artwork * LIGHT.strength.max;
  const surface = withArtwork * (1 - LIGHT.veilOpacity) + base * LIGHT.veilOpacity;
  return fromSrgb(surface);
}

describe("artwork light", () => {
  const surface = worstCaseSurfaceLuminance();

  it("keeps primary and secondary text at AA on the brightest artwork", () => {
    expect(contrast(luminance(ink.one), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(luminance(ink.two), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps past lyric lines (Ink-3, large text) at 3:1 on the brightest artwork", () => {
    expect(contrast(luminance(ink.three), surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps Ink-3 at AA on the plain workspace background", () => {
    expect(contrast(luminance(ink.three), luminance(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the three inks visibly distinct", () => {
    expect(luminance(ink.two) - luminance(ink.three)).toBeGreaterThan(0.1);
    expect(luminance(ink.one) - luminance(ink.two)).toBeGreaterThan(0.2);
  });
});
