import { motionFor, type SvelteMotion } from "$lib/ui/motion/svelte-motion";

/** Leaving is quicker than arriving. */
const EXIT_SPEED = 0.7;

/**
 * The one timeline for opening and closing Now Playing: the dock gives up its waveform slot, the
 * surface lifts, the sleeve lands. Closing plays the same motion in about 70% of the time.
 */
export function nowPlayingMotion(opening: boolean, reducedMotion: boolean): SvelteMotion {
  const base = motionFor("largeMove", reducedMotion);
  return opening || reducedMotion ? base : { ...base, duration: base.duration * EXIT_SPEED };
}
