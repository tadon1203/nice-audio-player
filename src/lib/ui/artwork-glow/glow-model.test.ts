import { describe, expect, it } from "vitest";
import {
  breathingOpacity,
  contrastRatio,
  grayLuminance,
  INK,
  GLOW,
  readableAccent,
  worstCaseSurfaceLuminance,
  type GlowStrength,
} from "./glow-model";

const luminance = grayLuminance;
const contrast = contrastRatio;
const background = INK.background;
const ink = INK;

describe("artwork glow", () => {
  const surface = worstCaseSurfaceLuminance();

  it("keeps primary and secondary text at AA on the brightest artwork", () => {
    expect(contrast(luminance(ink.one), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(luminance(ink.two), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps past lyrics and small metadata at AA on the brightest artwork", () => {
    expect(contrast(luminance(ink.three), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps Ink-3 at AA on the plain workspace background", () => {
    expect(contrast(luminance(ink.three), luminance(background))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the three inks visibly distinct", () => {
    expect(luminance(ink.two) - luminance(ink.three)).toBeGreaterThan(0.1);
    expect(luminance(ink.one) - luminance(ink.two)).toBeGreaterThan(0.2);
  });
});

describe("readable accent", () => {
  const surface = worstCaseSurfaceLuminance();
  const luminanceOf = (hex: string) => {
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
      expect(contrast(luminanceOf(accent), surface)).toBeGreaterThanOrEqual(4.5);
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
    // Faint is dimmer than max, so the max worst case (tested above) bounds it.
    expect(GLOW.strength.faint).toBeLessThan(GLOW.strength.max);
  });
});
