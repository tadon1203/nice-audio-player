import { prefersReducedMotion } from "svelte/motion";
import { SpringCurve } from "./spring-curve";
import { TokenTiming } from "./token-timing";
import type { MotionToken } from "./tokens";

/** What a Svelte transition, `animate:` directive or `Tween` takes: a length and an easing. */
export interface MotionTiming {
  /** Milliseconds. */
  readonly duration: number;
  readonly easing: (t: number) => number;
}

/** The one entry point for script-driven motion. */
export class SvelteMotion {
  /**
   * A token as a length and an easing. Under reduced motion every token is the crossfade; callers
   * never ask.
   */
  public static of(token: MotionToken): MotionTiming {
    return {
      duration: TokenTiming.duration(token, prefersReducedMotion.current),
      easing: (t: number): number => SpringCurve.easing(t),
    };
  }
}
