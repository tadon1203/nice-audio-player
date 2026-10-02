import { flip } from "svelte/animate";
import type { AnimationConfig } from "svelte/animate";
import { prefersReducedMotion } from "svelte/motion";
import { motionFor } from "./svelte-motion";
import type { MotionToken } from "./tokens";

/**
 * `animate:` for a keyed list reordering: rows travel to their new place. Under reduced motion
 * nothing travels and the row is the crossfade (DESIGN.md, principle 7). `delay` staggers it.
 */
export function flipMotion(
  node: Element,
  rects: { from: DOMRect; to: DOMRect },
  { token = "move", delay = 0 }: { token?: MotionToken; delay?: number } = {},
): AnimationConfig {
  const motion = motionFor(token);
  if (prefersReducedMotion.current) {
    return { duration: motion.duration, css: (t) => `opacity: ${t}` };
  }
  return flip(node, rects, { ...motion, delay });
}
