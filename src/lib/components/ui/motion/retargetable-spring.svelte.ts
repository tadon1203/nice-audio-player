import { prefersReducedMotion } from "svelte/motion";
import { SpringState } from "./spring-state";
import { motionTokens } from "./tokens";

/**
 * A number that follows a target on the one spring and keeps its velocity when the
 * target changes mid-flight. A reactive wrapper over `spring-state.ts`: it samples the closed
 * form on animation frames, so the result does not depend on the frame rate, and it stops its
 * own loop once settled. Under reduced motion, or with `instant`, it jumps.
 */
export class RetargetableSpring {
  /** The sampled value. */
  public current = $state(0);
  /** Perceptual duration in ms; a change applies from the next `set`. */
  public duration: number;
  #target = $state(0);
  #state: SpringState;
  readonly #precision: number;
  #frame = 0;

  public constructor(
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
    this.#state = SpringState.resting(value, duration);
  }

  public get target(): number {
    return this.#target;
  }

  public set(target: number, options: { instant?: boolean } = {}): void {
    const now = performance.now();
    this.#target = target;
    if (options.instant || prefersReducedMotion.current) {
      this.stop();
      this.#state = this.#state.jump(target, now);
      this.current = target;
      return;
    }
    this.#state = this.#state.retarget(target, now, this.duration);
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#tick);
  }

  /** Stops following the target; `current` stays where it is. */
  public stop(): void {
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  readonly #tick = (): void => {
    this.#frame = 0;
    const now = performance.now();
    if (this.#state.isSettled(now, this.#precision)) {
      this.current = this.#state.target;
      return;
    }
    this.current = this.#state.sample(now).value;
    this.#frame = requestAnimationFrame(this.#tick);
  };
}
