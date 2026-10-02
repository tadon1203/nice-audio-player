import { prefersReducedMotion } from "svelte/motion";
import { springEasing } from "./spring-curve";
import { tokenDuration, type MotionToken } from "./tokens";

/** What a Svelte transition, `animate:` directive or `Tween` takes: a length and an easing. */
export type SvelteMotion = {
  /** Milliseconds. */
  readonly duration: number;
  readonly easing: (t: number) => number;
};

/**
 * The one entry point for script-driven motion: a token as a length and an easing. Under reduced
 * motion every token is the crossfade; callers never ask.
 */
export function motionFor(token: MotionToken): SvelteMotion {
  return { duration: tokenDuration(token, prefersReducedMotion.current), easing: springEasing };
}
