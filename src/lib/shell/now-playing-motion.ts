import { motionTokens } from "$lib/ui/motion/tokens";

/** Leaving is quicker than arriving. */
export const EXIT_SPEED = 0.7;

/**
 * The perceptual duration for opening and closing Now Playing: the one timeline the dock gives up
 * its waveform slot on, the surface lifts and the sleeve lands. Closing is the same spring run
 * about 30% faster.
 */
export function nowPlayingDuration(opening: boolean): number {
  const { duration } = motionTokens.large;
  return opening ? duration : duration * EXIT_SPEED;
}
