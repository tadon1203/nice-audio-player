import { createGeneratorEasing, spring } from "motion";
import { resolveTransition, type MotionToken } from "./tokens";

const SAMPLES = 24;

/**
 * A token as a CSS duration and `linear()` easing, so CSS transitions (hover, press, overlays)
 * take their timing from `tokens.ts` instead of declaring their own. Under reduced motion every
 * token is the crossfade.
 */
export function cssMotionFor(token: MotionToken, reducedMotion: boolean) {
  const transition = resolveTransition(token, reducedMotion);
  if (transition.kind === "tween") {
    return { duration: `${transition.duration * 1000}ms`, easing: "ease-out" };
  }
  const { ease, duration } = createGeneratorEasing(
    { visualDuration: transition.visualDuration, bounce: transition.bounce },
    undefined,
    spring,
  );
  const stops = Array.from({ length: SAMPLES + 1 }, (_, i) => +ease(i / SAMPLES).toFixed(4));
  return { duration: `${Math.round(duration * 1000)}ms`, easing: `linear(${stops.join(", ")})` };
}

/**
 * Publishes the CSS timing variables: `feedback` for the default transition, `smallMove` for
 * overlays, `press`, and `mediumMove`. Returns a function that removes them.
 */
export function applyCssMotion(root: HTMLElement, reducedMotion: boolean): () => void {
  const feedback = cssMotionFor("feedback", reducedMotion);
  const overlay = cssMotionFor("smallMove", reducedMotion);
  const press = cssMotionFor("press", reducedMotion);
  const medium = cssMotionFor("mediumMove", reducedMotion);
  const values = {
    "--motion-press-duration": press.duration,
    "--motion-press-easing": press.easing,
    "--motion-medium-duration": medium.duration,
    "--motion-medium-easing": medium.easing,
    "--default-transition-duration": feedback.duration,
    "--default-transition-timing-function": feedback.easing,
    "--motion-overlay-duration": overlay.duration,
    "--motion-overlay-easing": overlay.easing,
  };
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
  return () => {
    for (const name of Object.keys(values)) root.style.removeProperty(name);
  };
}
