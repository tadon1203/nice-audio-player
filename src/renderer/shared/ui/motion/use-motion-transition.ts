import { useReducedMotion, type Transition } from "motion/react";
import { resolveTransition, type MotionToken } from "./tokens";

/** The transition for a motion token, already reduced-motion aware. */
export function useMotionTransition(token: MotionToken): Transition {
  return resolveTransition(token, useReducedMotion() === true);
}
