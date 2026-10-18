/**
 * A critically damped spring that can be retargeted while it moves (ADR 0002), as a closed
 * form: it never overshoots, keeps its velocity when the target changes, and is exact at any
 * frame rate because it is a function of time, not a per-frame integration.
 *
 * With `x` the offset from the target and `ω = 2π / perceptual duration`:
 *
 *     x(τ) = (x₀ + (v₀ + ω·x₀)·τ)·e^(−ωτ)
 *     v(τ) = (v₀ − ω·(v₀ + ω·x₀)·τ)·e^(−ωτ)
 *
 * A value object: each change returns a new spring. Pure: the caller supplies the clock. The
 * reactive wrapper is `retargetable-spring.svelte.ts`.
 */

export interface SpringSample {
  value: number;
  velocity: number;
}

const omegaOf = (perceptualMs: number): number => (2 * Math.PI) / (perceptualMs / 1000);

export class SpringState {
  /** Where the spring is going. */
  public readonly target: number;
  /** Offset from the target when this run started. */
  public readonly offset: number;
  /** Velocity when this run started, in value units per second. */
  public readonly velocity: number;
  /** Rate, in radians per second. */
  public readonly omega: number;
  /** Start of this run, in ms. */
  public readonly at: number;

  public constructor(target: number, offset: number, velocity: number, omega: number, at: number) {
    this.target = target;
    this.offset = offset;
    this.velocity = velocity;
    this.omega = omega;
    this.at = at;
  }

  /** A spring at rest on `value`. */
  public static resting(value: number, perceptualMs: number): SpringState {
    return new SpringState(value, 0, 0, omegaOf(perceptualMs), 0);
  }

  /** Where the spring is, and how fast it moves, at `now` (ms). */
  public sample(now: number): SpringSample {
    const seconds = Math.max(0, now - this.at) / 1000;
    const { offset, velocity, omega } = this;
    const decay = Math.exp(-omega * seconds);
    const carry = velocity + omega * offset;
    return {
      value: this.target + (offset + carry * seconds) * decay,
      velocity: (velocity - omega * carry * seconds) * decay,
    };
  }

  /**
   * Aims the spring at a new target from where it is at `now`, keeping its velocity, optionally
   * at a new pace.
   */
  public retarget(target: number, now: number, perceptualMs?: number): SpringState {
    const here = this.sample(now);
    return new SpringState(
      target,
      here.value - target,
      here.velocity,
      perceptualMs === undefined ? this.omega : omegaOf(perceptualMs),
      now,
    );
  }

  /** The spring jumped to `value`: at rest, instantly. */
  public jump(value: number, now: number): SpringState {
    return new SpringState(value, 0, 0, this.omega, now);
  }

  /**
   * Whether the spring looks stopped: within `precision` (value units) of the target and moving
   * slower than the last `precision` of distance would take to cover.
   */
  public isSettled(now: number, precision: number): boolean {
    const { value, velocity } = this.sample(now);
    return Math.abs(value - this.target) < precision && Math.abs(velocity) < precision * this.omega;
  }
}
