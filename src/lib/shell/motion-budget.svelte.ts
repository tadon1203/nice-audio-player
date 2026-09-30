import { createContext } from "svelte";
import { prefersReducedMotion } from "svelte/motion";
import type { Settings } from "$lib/settings/settings.svelte";

/**
 * How much may move by itself (DESIGN.md, the attention budget).
 *
 * - `full`: the position marker plus the small idle motion (the Light breathing).
 * - `calm`: only what marks the current position moves on its own; everything else moves only
 *   when something changes.
 * - `reduced`: the system asks for less motion; every movement is a crossfade.
 */
export type MotionBudget = "full" | "calm" | "reduced";

export function createMotionBudget(settings: Settings): { readonly current: MotionBudget } {
  const current = $derived<MotionBudget>(
    prefersReducedMotion.current ? "reduced" : settings.calmMotion ? "calm" : "full",
  );
  return {
    get current() {
      return current;
    },
  };
}

export const [getMotionBudget, setMotionBudget] = createContext<{
  readonly current: MotionBudget;
}>();
