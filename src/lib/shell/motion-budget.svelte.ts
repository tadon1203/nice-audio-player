import { prefersReducedMotion } from "svelte/motion";
import type { Appearance } from "#lib/settings/appearance.svelte";

/**
 * How much may move by itself (DESIGN.md, the attention budget).
 *
 * - `full`: the position marker plus the small idle motion (the Artwork glow breathing).
 * - `calm`: only what marks the current position moves on its own; everything else moves only
 *   when something changes.
 * - `reduced`: the system asks for less motion; every movement is a crossfade.
 */
export type MotionLevel = "full" | "calm" | "reduced";

/** The motion level the system setting and the Appearance give together. */
export class MotionBudget {
  readonly #appearance: Appearance;

  constructor(appearance: Appearance) {
    this.#appearance = appearance;
  }

  /** Reactive: reading it in a template or an effect follows both sources. */
  get current(): MotionLevel {
    if (prefersReducedMotion.current) return "reduced";
    return this.#appearance.calmMotion ? "calm" : "full";
  }
}
