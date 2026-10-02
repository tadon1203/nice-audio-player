/**
 * The one curve every movement follows (ADR 0007): a critically damped spring run from rest, so
 * it never overshoots. From rest it is `x(u) = 1 - (1 + u)·e^(-u)` with `u = ωt` and
 * `ω = 2π / perceptual duration`. It is cut off where the residual falls to `RESIDUAL` and
 * renormalized so it ends exactly at 1.
 *
 * The shape does not depend on the duration, so there is one easing and one CSS string; a
 * duration only says how long the curve runs (`settlingLength`).
 */

/** Where the curve is cut off: the part of the move still left. */
const RESIDUAL = 0.005;
/** Points in the CSS `linear()` string (evenly spaced). */
const LINEAR_POINTS = 41;

/** The part of a move still left at `u = ωt`, for a spring from rest. */
const remaining = (u: number) => (1 + u) * Math.exp(-u);

/** `u = ωT` where the residual reaches `RESIDUAL` (bisection; `remaining` only falls). */
const CUT_OFF = (() => {
  let low = 0;
  let high = 50;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (remaining(mid) > RESIDUAL) low = mid;
    else high = mid;
  }
  return high;
})();

/** The curve as a function of progress through its run, 0 to 1. Starts flat, ends exactly at 1. */
export function springEasing(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return (1 - remaining(CUT_OFF * progress)) / (1 - RESIDUAL);
}

/**
 * How long the curve runs, in ms, for a perceptual duration (Apple's sense: about when the
 * spring looks done, which the residual cut makes about 1.18× longer).
 */
export function settlingLength(perceptualMs: number): number {
  return Math.round((perceptualMs * CUT_OFF) / (2 * Math.PI));
}

/** The same curve as a CSS `linear()` easing. */
export const springLinear: string = (() => {
  const points = Array.from({ length: LINEAR_POINTS }, (_, index) =>
    Number(springEasing(index / (LINEAR_POINTS - 1)).toFixed(4)),
  );
  return `linear(${points.join(", ")})`;
})();
