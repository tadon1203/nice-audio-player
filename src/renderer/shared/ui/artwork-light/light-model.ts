/**
 * Artwork Light: a static, blurred copy of the artwork under a veil (see DESIGN.md).
 * The caps below are what keep text readable on top of any artwork, including a
 * pure white one, so change them only together with `light-model.test.ts`.
 */
export const LIGHT = {
  blurPx: 64,
  /** Multiplies the artwork's brightness before it is composited. */
  brightness: 0.55,
  /** How much of the page background is laid back over the blurred artwork. */
  veilOpacity: 0.7,
  /** Share of the artwork that reaches the surface, per place. */
  strength: { max: 1, strong: 0.85, medium: 0.6, faint: 0.3 },
} as const;

export type LightStrength = keyof typeof LIGHT.strength;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The opacity of a breathing Light for a loudness `level` (0-1): it only ever dims from its
 * strength, never exceeds it, so the contrast guarantees below keep holding.
 */
export function breathingOpacity(strength: LightStrength, level: number): number {
  return LIGHT.strength[strength] * (0.85 + 0.15 * clamp01(level));
}

/** The extra scale a breathing Light swells by (on top of its own), 1 at silence. */
export function breathingScale(level: number): number {
  return 1 + 0.03 * clamp01(level);
}

/** OKLCH lightness of the page background and of the three inks (see `styles.css`). */
export const INK = { background: 0.145, one: 0.985, two: 0.708, three: 0.6 } as const;

/** Neutral OKLCH grays have relative luminance Y = L^3. */
export const grayLuminance = (oklchLightness: number) => oklchLightness ** 3;

const toSrgb = (y: number) => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
const fromSrgb = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG contrast ratio between two relative luminances. */
export const contrastRatio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Luminance of the brightest possible Light (pure white artwork) after the veil. */
export function worstCaseSurfaceLuminance(): number {
  const base = toSrgb(grayLuminance(INK.background));
  // Pure white artwork after `brightness()`. CSS blends in gamma-encoded sRGB: the artwork
  // over the base at `strength`, then the veil over that.
  const artwork = Math.min(1, LIGHT.brightness);
  const withArtwork = base * (1 - LIGHT.strength.max) + artwork * LIGHT.strength.max;
  const surface = withArtwork * (1 - LIGHT.veilOpacity) + base * LIGHT.veilOpacity;
  return fromSrgb(surface);
}
