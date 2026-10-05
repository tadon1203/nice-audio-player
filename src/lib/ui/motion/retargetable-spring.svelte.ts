import { prefersReducedMotion } from "svelte/motion";
import {
  isSpringSettled,
  jumpSpring,
  restingSpring,
  retargetSpring,
  sampleSpring,
  type SpringState,
} from "./analytic-spring";
import { motionTokens } from "./tokens";

/**
 * A number that follows a target on the one spring (ADR 0002) and keeps its velocity when the
 * target changes mid-flight. A reactive wrapper over `analytic-spring.ts`: it samples the closed
 * form on animation frames, so the result does not depend on the frame rate, and it stops its
 * own loop once settled. Under reduced motion, or with `instant`, it jumps.
 */
export class RetargetableSpring {
  /** The sampled value. */
  current = $state(0);
  /** Perceptual duration in ms; a change applies from the next `set`. */
  duration: number;
  #target = $state(0);
  #state: SpringState;
  #precision: number;
  #frame = 0;

  constructor(
    value: number,
    {
      precision = 0.01,
      duration = motionTokens.large.duration,
    }: { precision?: number; duration?: number } = {},
  ) {
    this.current = value;
    this.#target = value;
    this.duration = duration;
    this.#precision = precision;
    this.#state = restingSpring(value, duration);
  }

  get target() {
    return this.#target;
  }

  set(target: number, options: { instant?: boolean } = {}) {
    const now = performance.now();
    this.#target = target;
    if (options.instant || prefersReducedMotion.current) {
      this.stop();
      this.#state = jumpSpring(this.#state, target, now);
      this.current = target;
      return;
    }
    this.#state = retargetSpring(this.#state, target, now, this.duration);
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#tick);
  }

  /** Stops following the target; `current` stays where it is. */
  stop() {
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  #tick = () => {
    this.#frame = 0;
    const now = performance.now();
    if (isSpringSettled(this.#state, now, this.#precision)) {
      this.current = this.#state.target;
      return;
    }
    this.current = sampleSpring(this.#state, now).value;
    this.#frame = requestAnimationFrame(this.#tick);
  };
}
