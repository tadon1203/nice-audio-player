import type { TransitionConfig } from "svelte/transition";
import { SvelteMotion } from "./svelte-motion";
import type { MotionToken } from "./tokens";

/** A Svelte transition that slides and fades. */
export class SvelteSlide {
  /**
   * Travels `x`/`y` px while fading to `opacity`. When `reduced`, nothing travels and the motion is
   * the short crossfade every token becomes (DESIGN.md, Motion).
   */
  public static transition(
    token: MotionToken,
    reduced: boolean,
    { x = 0, y = 0, opacity = 1 }: { x?: number; y?: number; opacity?: number } = {},
  ): TransitionConfig {
    const { duration, easing } = SvelteMotion.of(token);
    return {
      duration,
      easing,
      css: (t, u) =>
        `transform: translate(${reduced ? 0 : x * u}px, ${reduced ? 0 : y * u}px); opacity: ${t * opacity}`,
    };
  }
}
