import { SpringCurve } from "../../src/lib/components/ui/motion/spring-curve";
import { motionTokens, type MotionToken } from "../../src/lib/components/ui/motion/tokens";

/** How long a token's movement runs, in ms: tests wait on this, never on a literal. */
export const motionMs = (token: MotionToken): number =>
  SpringCurve.settlingLength(motionTokens[token].duration);
