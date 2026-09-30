import { createGeneratorEasing, spring } from "motion";
import { cubicInOut, cubicOut } from "svelte/easing";
import { resolveTransition, type MotionToken } from "./tokens";

/** What a Svelte transition, `animate:` directive or `Tween` takes: a length and an easing. */
export type SvelteMotion = {
  /** Milliseconds. */
  readonly duration: number;
  readonly easing: (t: number) => number;
};

const cache = new Map<string, SvelteMotion>();

/**
 * A motion token as Svelte motion parameters. A spring becomes the easing of its own curve
 * (`visualDuration` and `bounce` as in the token), so the feel matches the `motion` package's
 * springs used elsewhere. Under reduced motion every token is the same short crossfade.
 */
export function motionFor(token: MotionToken, reducedMotion: boolean): SvelteMotion {
  const transition = resolveTransition(token, reducedMotion);
  const key = reducedMotion ? "reduced" : token;
  const cached = cache.get(key);
  if (cached) return cached;
  let motion: SvelteMotion;
  if (transition.kind === "spring") {
    const { ease, duration } = createGeneratorEasing(
      { visualDuration: transition.visualDuration, bounce: transition.bounce },
      undefined,
      spring,
    );
    motion = { duration: duration * 1000, easing: ease };
  } else {
    motion = {
      duration: transition.duration * 1000,
      easing: transition.ease === "easeOut" ? cubicOut : cubicInOut,
    };
  }
  cache.set(key, motion);
  return motion;
}
