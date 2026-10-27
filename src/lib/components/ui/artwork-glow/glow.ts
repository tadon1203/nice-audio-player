/**
 * Artwork glow: a static, blurred copy of the artwork under a veil (see DESIGN.md).
 * The caps below are what keep text readable on top of any artwork, including a
 * pure white one, so change them only together with `glow-contrast.test.ts`.
 */
export const GLOW = {
  blurPx: 64,
  /** Multiplies the artwork's brightness before it is composited. */
  brightness: 0.55,
  /** How much of the page background is laid back over the blurred artwork. */
  veilOpacity: 0.85,
  /** Share of the artwork that reaches the surface, per place. */
  strength: { max: 1, strong: 0.85, medium: 0.6, faint: 0.3 },
} as const;

export type GlowStrength = keyof typeof GLOW.strength;

/** OKLCH lightness of the page background and of the three inks (see `styles.css`). */
export const INK = { background: 0.145, one: 0.985, two: 0.708, three: 0.62 } as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The opacity of an Artwork glow that breathes with loudness, for a loudness `level` (0-1). It only
 * ever dims from the strength, never exceeds it, so the contrast guarantees in `glow-contrast.ts`
 * keep holding.
 */
export function breathingOpacity(strength: GlowStrength, level: number): number {
  return GLOW.strength[strength] * (0.85 + 0.15 * clamp01(level));
}
