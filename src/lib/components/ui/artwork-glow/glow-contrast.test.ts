import { describe, expect, it } from "vitest";
import { breathingOpacity, GLOW, type GlowStrength, INK } from "./glow";
import { GlowContrast } from "./glow-contrast";

const luminance = (oklchLightness: number): number => GlowContrast.grayLuminance(oklchLightness);
const contrastRatio = (a: number, b: number): number => GlowContrast.contrastRatio(a, b);
const worstCaseSurfaceLuminance = (): number => GlowContrast.worstCaseSurfaceLuminance();
const readableAccent = (hex: string | null | undefined): string | null =>
  GlowContrast.readableAccent(hex);
const background = INK.background;
const ink = INK;

describe("artwork glow", () => {
  const surface = worstCaseSurfaceLuminance();

  it("keeps primary and secondary text at AA on the brightest artwork", () => {
    expect(contrastRatio(luminance(ink.one), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(luminance(ink.two), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps past lyrics and small metadata at AA on the brightest artwork", () => {
    expect(contrastRatio(luminance(ink.three), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps Ink-3 at AA on the plain workspace background", () => {
    expect(contrastRatio(luminance(ink.three), luminance(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the three inks visibly distinct", () => {
    expect(luminance(ink.two) - luminance(ink.three)).toBeGreaterThan(0.1);
    expect(luminance(ink.one) - luminance(ink.two)).toBeGreaterThan(0.2);
  });
});

describe("readable accent", () => {
  const surface = worstCaseSurfaceLuminance();
  const luminanceOf = (hex: string): number => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const [r, g, b] = channels.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  it.each(["#000000", "#1a2b6d", "#7a1f1f", "#2e7d32", "#ffd54f", "#ffffff", "#808080"])(
    "keeps %s at AA over the brightest Artwork glow",
    (hex) => {
      const accent = readableAccent(hex)!;
      expect(contrastRatio(luminanceOf(accent), surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves an already readable color alone", () => {
    expect(readableAccent("#ffd54f")).toBe("#ffd54f");
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(readableAccent("red")).toBeNull();
    expect(readableAccent(null)).toBeNull();
  });
});

describe("breathing glow", () => {
  it.each(Object.keys(GLOW.strength) as GlowStrength[])(
    "never gets brighter than the %s strength, so the contrast caps still hold",
    (strength) => {
      for (const level of [-1, 0, 0.5, 1, 4]) {
        expect(breathingOpacity(strength, level)).toBeLessThanOrEqual(GLOW.strength[strength]);
      }
      expect(breathingOpacity(strength, 1)).toBeCloseTo(GLOW.strength[strength]);
      expect(breathingOpacity(strength, 0)).toBeCloseTo(GLOW.strength[strength] * 0.85);
    },
  );

  it("keeps text readable over the faint glow used behind library tiles", () => {
    // Faint is dimmer than max, so the max worst case bounds it.
    expect(GLOW.strength.faint).toBeLessThan(GLOW.strength.max);
  });
});
