import { useReducedMotion, type Transition } from "motion/react";
import { motionTokens, resolveTransition } from "@/renderer/shared/ui/motion";

/** Leaving is quicker than arriving. */
const EXIT_SPEED = 0.7;
/** Delay before the lyrics and text settle in, so the sleeve lands first. */
const CONTENT_DELAY_S = 0.12;

/**
 * The one timeline for opening and closing Now Playing: the surface lifts, the sleeve lands,
 * then the text (and the waveform, which grows when its data arrives) follows. Closing plays
 * the same motion in about 70% of the time.
 */
export function useNowPlayingTransitions() {
  const reduced = useReducedMotion() === true;
  const open = resolveTransition("largeMove", reduced);
  const close: Transition = reduced
    ? open
    : {
        ...motionTokens.largeMove,
        visualDuration: motionTokens.largeMove.visualDuration * EXIT_SPEED,
      };
  const content: Transition = reduced ? open : { ...open, delay: CONTENT_DELAY_S };
  return { open, close, content };
}
