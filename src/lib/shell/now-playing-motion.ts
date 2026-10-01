import { settle } from "$lib/ui/motion/tokens";

/** Leaving is quicker than arriving. */
const EXIT_SPEED = 0.7;

/**
 * The spring for opening and closing Now Playing: the one timeline the dock gives up its waveform
 * slot on, the surface lifts and the sleeve lands. Closing is the same spring run about 30%
 * faster (stiffness scales with the square of the speed, damping with the speed, so it stays
 * fully damped).
 */
export function nowPlayingSpring(opening: boolean): { stiffness: number; damping: number } {
  if (opening) return settle;
  return {
    stiffness: settle.stiffness / EXIT_SPEED ** 2,
    damping: settle.damping / EXIT_SPEED,
  };
}
