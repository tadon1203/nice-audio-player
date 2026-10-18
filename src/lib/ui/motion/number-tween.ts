import { SpringCurve } from "./spring-curve";

/**
 * Tweens a number outside of any component: for imperative animations that drive a callback
 * (the clock's seek glide, a mask) rather than a reactive value.
 */
export class NumberTween {
  /** Resolves when the tween ends, whether it finished or was stopped. */
  public readonly finished: Promise<void>;
  readonly #from: number;
  readonly #to: number;
  readonly #duration: number;
  readonly #easing: (t: number) => number;
  readonly #onUpdate: (value: number) => void;
  readonly #onComplete: (() => void) | undefined;
  readonly #start = performance.now();
  #frame = 0;
  #done: () => void = () => undefined;

  /** `duration` is in milliseconds. */
  public constructor(
    from: number,
    to: number,
    {
      duration,
      easing = (t: number): number => SpringCurve.easing(t),
      onUpdate,
      onComplete,
    }: {
      duration: number;
      easing?: (t: number) => number;
      onUpdate: (value: number) => void;
      onComplete?: () => void;
    },
  ) {
    this.#from = from;
    this.#to = to;
    this.#duration = duration;
    this.#easing = easing;
    this.#onUpdate = onUpdate;
    this.#onComplete = onComplete;
    this.finished = new Promise<void>((resolve) => (this.#done = resolve));
    this.#frame = requestAnimationFrame(this.#step);
  }

  public stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#done();
  }

  readonly #step = (now: number): void => {
    const t = this.#duration <= 0 ? 1 : Math.min((now - this.#start) / this.#duration, 1);
    this.#onUpdate(this.#from + (this.#to - this.#from) * this.#easing(t));
    if (t < 1) {
      this.#frame = requestAnimationFrame(this.#step);
      return;
    }
    this.#onComplete?.();
    this.#done();
  };
}
