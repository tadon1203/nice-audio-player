import { settlingLength } from "../../src/lib/ui/motion/spring-curve";
import { motionTokens, type MotionToken } from "../../src/lib/ui/motion/tokens";

/** How long a token's movement runs, in ms: tests wait on this, never on a literal. */
export const motionMs = (token: MotionToken) => settlingLength(motionTokens[token].duration);
