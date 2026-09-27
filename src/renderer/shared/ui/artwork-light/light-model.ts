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
  strength: { max: 1, strong: 0.85, medium: 0.6 },
} as const;

export type LightStrength = keyof typeof LIGHT.strength;
