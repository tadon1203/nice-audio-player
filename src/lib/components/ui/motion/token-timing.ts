import { SpringCurve } from "./spring-curve";
import { crossfade, motionTokens, type MotionToken } from "./tokens";

/** Turns a token into lengths in ms. Calculations only. */
export class TokenTiming {
  /** A delay as a share of a token's perceptual duration, so retuning the token retunes it. */
  public static delayOf(token: MotionToken, share: number): number {
    return Math.round(motionTokens[token].duration * share);
  }

  /** How long a token runs, in ms: its settling length, or the crossfade under reduced motion. */
  public static duration(token: MotionToken, reducedMotion: boolean): number {
    return reducedMotion
      ? crossfade.duration
      : SpringCurve.settlingLength(motionTokens[token].duration);
  }
}
