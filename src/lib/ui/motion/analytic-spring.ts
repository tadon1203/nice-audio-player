/**
 * A critically damped spring that can be retargeted while it moves (ADR 0007), as a closed
 * form: it never overshoots, keeps its velocity when the target changes, and is exact at any
 * frame rate because it is a function of time, not a per-frame integration.
 *
 * With `x` the offset from the target and `ω = 2π / perceptual duration`:
 *
 *     x(τ) = (x₀ + (v₀ + ω·x₀)·τ)·e^(−ωτ)
 *     v(τ) = (v₀ − ω·(v₀ + ω·x₀)·τ)·e^(−ωτ)
 *
 * Pure: the caller supplies the clock. The reactive wrapper is `retargetable-spring.svelte.ts`.
 */

export type SpringState = {
  readonly target: number;
  /** Offset from the target when this run started. */
  readonly offset: number;
  /** Velocity when this run started, in value units per second. */
  readonly velocity: number;
  /** Rate, in radians per second. */
  readonly omega: number;
  /** Start of this run, in ms. */
  readonly at: number;
};

export type SpringSample = { value: number; velocity: number };

const omegaOf = (perceptualMs: number) => (2 * Math.PI) / (perceptualMs / 1000);

/** A spring at rest on `value`. */
export function restingSpring(value: number, perceptualMs: number): SpringState {
  return { target: value, offset: 0, velocity: 0, omega: omegaOf(perceptualMs), at: 0 };
}

/** Where the spring is, and how fast it moves, at `now` (ms). */
export function sampleSpring(state: SpringState, now: number): SpringSample {
  const seconds = Math.max(0, now - state.at) / 1000;
  const { offset, velocity, omega } = state;
  const decay = Math.exp(-omega * seconds);
  const carry = velocity + omega * offset;
  return {
    value: state.target + (offset + carry * seconds) * decay,
    velocity: (velocity - omega * carry * seconds) * decay,
  };
}

/**
 * Aims the spring at a new target from where it is at `now`, keeping its velocity, optionally
 * at a new pace.
 */
export function retargetSpring(
  state: SpringState,
  target: number,
  now: number,
  perceptualMs?: number,
): SpringState {
  const here = sampleSpring(state, now);
  return {
    target,
    offset: here.value - target,
    velocity: here.velocity,
    omega: perceptualMs === undefined ? state.omega : omegaOf(perceptualMs),
    at: now,
  };
}

/** The spring jumped to `value`: at rest, instantly. */
export function jumpSpring(state: SpringState, value: number, now: number): SpringState {
  return { ...state, target: value, offset: 0, velocity: 0, at: now };
}

/**
 * Whether the spring looks stopped: within `precision` (value units) of the target and moving
 * slower than the last `precision` of distance would take to cover.
 */
export function isSpringSettled(state: SpringState, now: number, precision: number): boolean {
  const { value, velocity } = sampleSpring(state, now);
  return Math.abs(value - state.target) < precision && Math.abs(velocity) < precision * state.omega;
}
