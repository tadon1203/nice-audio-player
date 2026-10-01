import { EASE_OUT_CSS, resolveDuration, type MotionToken } from "./tokens";

/** A token as the CSS duration and easing of a transition. Under reduced motion it is the crossfade. */
export function cssMotionFor(token: MotionToken, reducedMotion: boolean) {
  return { duration: `${resolveDuration(token, reducedMotion)}ms`, easing: EASE_OUT_CSS };
}

/**
 * Publishes the CSS timing variables: `feedback` for the default transition (and press),
 * `move` for overlays and `large` for the rest. Returns a function that removes them.
 */
export function applyCssMotion(root: HTMLElement, reducedMotion: boolean): () => void {
  const feedback = cssMotionFor("feedback", reducedMotion);
  const move = cssMotionFor("move", reducedMotion);
  const values = {
    "--default-transition-duration": feedback.duration,
    "--default-transition-timing-function": feedback.easing,
    "--motion-overlay-duration": move.duration,
    "--motion-overlay-easing": move.easing,
    "--motion-press-duration": feedback.duration,
    "--motion-press-easing": feedback.easing,
    "--motion-medium-duration": move.duration,
    "--motion-medium-easing": move.easing,
  };
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
  return () => {
    for (const name of Object.keys(values)) root.style.removeProperty(name);
  };
}
