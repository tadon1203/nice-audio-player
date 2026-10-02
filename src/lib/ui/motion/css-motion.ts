import { springLinear } from "./spring-curve";
import { tokenDuration, type MotionToken } from "./tokens";

/** A token as the CSS duration of a transition. Under reduced motion it is the crossfade. */
function cssDuration(token: MotionToken, reducedMotion: boolean) {
  return `${tokenDuration(token, reducedMotion)}ms`;
}

/**
 * Publishes the CSS motion variables: the curve, and the settling length of each token.
 * `--default-transition-*` is what Tailwind's `transition` utilities read. Returns a function
 * that removes them.
 */
export function applyCssMotion(root: HTMLElement, reducedMotion: boolean): () => void {
  const feedback = cssDuration("feedback", reducedMotion);
  const values = {
    "--motion-easing": springLinear,
    "--motion-feedback-duration": feedback,
    "--motion-move-duration": cssDuration("move", reducedMotion),
    "--motion-large-duration": cssDuration("large", reducedMotion),
    "--default-transition-duration": feedback,
    "--default-transition-timing-function": springLinear,
  };
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
  return () => {
    for (const name of Object.keys(values)) root.style.removeProperty(name);
  };
}
