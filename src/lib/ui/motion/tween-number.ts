import { springEasing } from "./spring-curve";

export type NumberTween = {
  stop: () => void;
  /** Resolves when the tween ends, whether it finished or was stopped. */
  finished: Promise<void>;
};

/**
 * Tweens a number outside of any component: for imperative animations that drive a callback
 * (the clock's seek glide, a mask) rather than a reactive value.
 */
export function tweenNumber(
  from: number,
  to: number,
  {
    duration,
    easing = springEasing,
    onUpdate,
    onComplete,
  }: {
    /** Milliseconds. */
    duration: number;
    easing?: (t: number) => number;
    onUpdate: (value: number) => void;
    onComplete?: () => void;
  },
): NumberTween {
  let frame = 0;
  let done: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const start = performance.now();
  const step = (now: number) => {
    const t = duration <= 0 ? 1 : Math.min((now - start) / duration, 1);
    onUpdate(from + (to - from) * easing(t));
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onComplete?.();
    done();
  };
  frame = requestAnimationFrame(step);
  return {
    stop() {
      cancelAnimationFrame(frame);
      done();
    },
    finished,
  };
}
