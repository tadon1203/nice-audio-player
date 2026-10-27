import { GLOW, INK } from "./glow";

const MIN_CONTRAST = 4.5;
const STEP = 0.01;

const toSrgb = (y: number): number => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
const fromSrgb = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const luminanceOf = ([r, g, b]: readonly [number, number, number]): number =>
  0.2126 * fromSrgb(r / 255) + 0.7152 * fromSrgb(g / 255) + 0.0722 * fromSrgb(b / 255);

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/** The contrast rules of the Artwork glow: what text can sit on it. Calculations only. */
export class GlowContrast {
  /** Neutral OKLCH grays have relative luminance Y = L^3. */
  public static grayLuminance(oklchLightness: number): number {
    return oklchLightness ** 3;
  }

  /** WCAG contrast ratio between two relative luminances. */
  public static contrastRatio(a: number, b: number): number {
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** Luminance of the brightest possible Artwork glow (pure white artwork) after the veil. */
  public static worstCaseSurfaceLuminance(): number {
    const base = toSrgb(GlowContrast.grayLuminance(INK.background));
    // Pure white artwork after `brightness()`. CSS blends in gamma-encoded sRGB: the artwork
    // over the base at `strength`, then the veil over that.
    const artwork = Math.min(1, GLOW.brightness);
    const withArtwork = base * (1 - GLOW.strength.max) + artwork * GLOW.strength.max;
    const surface = withArtwork * (1 - GLOW.veilOpacity) + base * GLOW.veilOpacity;
    return fromSrgb(surface);
  }

  /**
   * The artwork's representative color, lightened just enough to read as text/ink over even the
   * brightest Artwork glow (AA, 4.5:1). Lightening mixes toward white, so the hue is kept. Returns
   * null for input that is not `#rrggbb`.
   */
  public static readableAccent(hex: string | null | undefined): string | null {
    const rgb = hex == null ? null : parseHex(hex);
    if (rgb === null) return null;
    const surface = GlowContrast.worstCaseSurfaceLuminance();
    for (let mix = 0; mix <= 1; mix += STEP) {
      const mixed = rgb.map((channel) => channel + (255 - channel) * mix) as [
        number,
        number,
        number,
      ];
      const color = toHex(mixed);
      const rounded = parseHex(color)!;
      if (GlowContrast.contrastRatio(luminanceOf(rounded), surface) >= MIN_CONTRAST) return color;
    }
    return "#ffffff";
  }
}
