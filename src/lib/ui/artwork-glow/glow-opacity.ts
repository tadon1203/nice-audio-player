import { GLOW, type GlowStrength } from "./glow";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The opacity of an Artwork glow that breathes with loudness. Calculations only. */
export class GlowOpacity {
  /**
   * The opacity for a loudness `level` (0-1). It only ever dims from the strength, never exceeds
   * it, so the contrast guarantees in `GlowContrast` keep holding.
   */
  public static breathing(strength: GlowStrength, level: number): number {
    return GLOW.strength[strength] * (0.85 + 0.15 * clamp01(level));
  }
}
