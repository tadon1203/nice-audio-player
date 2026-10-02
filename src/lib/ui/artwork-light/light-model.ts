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

const MIN_CONTRAST = 4.5;
const STEP = 0.05;

const luminanceOf = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * fromSrgb(r / 255) + 0.7152 * fromSrgb(g / 255) + 0.0722 * fromSrgb(b / 255);

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

const toHex = (rgb: readonly number[]) =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/**
 * The artwork's representative color, lightened just enough to read as text/ink over even the
 * brightest Light (AA, 4.5:1). Lightening mixes toward white, so the hue is kept. Returns
 * null for input that is not `#rrggbb`.
 */
export function readableAccent(hex: string | null | undefined): string | null {
  const rgb = hex == null ? null : parseHex(hex);
  if (rgb === null) return null;
  const surface = worstCaseSurfaceLuminance();
  for (let mix = 0; mix <= 1; mix += STEP) {
    const mixed = rgb.map((channel) => channel + (255 - channel) * mix) as [number, number, number];
    if (contrastRatio(luminanceOf(mixed), surface) >= MIN_CONTRAST) return toHex(mixed);
  }
  return "#ffffff";
}
