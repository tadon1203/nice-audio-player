import { cubicOut } from "svelte/easing";
import { resolveDuration, type MotionToken } from "./tokens";

/** What a Svelte transition, `animate:` directive or `Tween` takes: a length and an easing. */
export type SvelteMotion = {
  /** Milliseconds. */
  readonly duration: number;
  readonly easing: (t: number) => number;
};

/** A motion token as Svelte motion parameters. Under reduced motion every token is the crossfade. */
export function motionFor(token: MotionToken, reducedMotion: boolean): SvelteMotion {
  return { duration: resolveDuration(token, reducedMotion), easing: cubicOut };
}
