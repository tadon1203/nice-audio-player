import { motionTokens } from "#lib/ui/motion/tokens";

/** The timing of Now Playing opening and closing. */
export class NowPlayingMotion {
  /** Leaving is quicker than arriving. */
  public static readonly EXIT_SPEED = 0.7;

  /**
   * The perceptual duration for opening and closing Now Playing: the one timeline the dock gives up
   * its waveform slot on, the surface lifts and the sleeve lands. Closing is the same spring run
   * about 30% faster.
   */
  public static duration(opening: boolean): number {
    const { duration } = motionTokens.large;
    return opening ? duration : duration * NowPlayingMotion.EXIT_SPEED;
  }
}
