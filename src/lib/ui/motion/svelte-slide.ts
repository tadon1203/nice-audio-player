import type { TransitionConfig } from "svelte/transition";
import { motionFor } from "./svelte-motion";
import type { MotionToken } from "./tokens";

/**
 * A Svelte transition that travels `x`/`y` px while fading to `opacity`. When `reduced`, nothing
 * travels and the motion is the short crossfade every token becomes (DESIGN.md, Motion).
 */
export function slideTransition(
  token: MotionToken,
  reduced: boolean,
  { x = 0, y = 0, opacity = 1 }: { x?: number; y?: number; opacity?: number } = {},
): TransitionConfig {
  const { duration, easing } = motionFor(token, reduced);
  return {
    duration,
    easing,
    css: (t, u) =>
      `transform: translate(${reduced ? 0 : x * u}px, ${reduced ? 0 : y * u}px); opacity: ${t * opacity}`,
  };
}
