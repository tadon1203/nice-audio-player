import type { MotionTransition } from "./tokens";

/**
 * A token as options for the `motion` package's `animate()`. The components' enter and exit use
 * Svelte transitions; this is for the few animations that run imperatively (the clock's seek glide,
 * the Light's rest level).
 */
export function toMotionOptions(transition: MotionTransition) {
  return transition.kind === "spring"
    ? ({
        type: "spring",
        visualDuration: transition.visualDuration,
        bounce: transition.bounce,
      } as const)
    : ({ duration: transition.duration, ease: transition.ease } as const);
}
