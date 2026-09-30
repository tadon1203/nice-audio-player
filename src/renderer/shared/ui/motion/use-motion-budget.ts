import { useReducedMotion } from "motion/react";
import { useCalmMotion } from "@/renderer/shared/lib/calm-motion";

/**
 * How much may move by itself (DESIGN.md, the attention budget).
 *
 * - `full`: the position marker plus the small idle motion (the Light breathing, a lit lyric
 *   character lifting as it lights).
 * - `calm`: only what marks the current position moves on its own; everything else moves only
 *   when something changes.
 * - `reduced`: the system asks for less motion; every movement is a crossfade.
 */
export type MotionBudget = "full" | "calm" | "reduced";

export function useMotionBudget(): MotionBudget {
  const reduced = useReducedMotion() === true;
  const calm = useCalmMotion((state) => state.enabled);
  return reduced ? "reduced" : calm ? "calm" : "full";
}
