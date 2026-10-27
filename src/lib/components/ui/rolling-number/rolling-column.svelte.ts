import { Tween } from "svelte/motion";
import { SvelteMotion } from "#lib/components/ui/motion/svelte-motion";
import { RollingDigit } from "./rolling-digit";
import { RollingMath, type RollDirection } from "./rolling-math";

/** How a digit column rolls to its next digit. */
export interface RollOptions {
  direction: RollDirection;
  /** Extra laps (a seek, a count that jumps). */
  spin: number;
  /** Seconds before the roll starts (the slot-machine stagger). */
  delay: number;
  /** Jump to the digit without rolling. */
  instant: boolean;
}

const HOME = RollingMath.HOME_LAP * RollingMath.LAP;

/**
 * The position of one digit column on its laps. A roll ends by re-centring on the shown digit, so
 * the column always has room to roll both ways. Promise logic lives here, not in the component.
 */
export class RollingColumn {
  readonly #position: Tween<number>;
  #shown: number;
  #generation = 0;

  public constructor(digit: number) {
    this.#position = new Tween(HOME + digit);
    this.#shown = digit;
  }

  /** The lap position, in digits: the column moves by this many rows. */
  public get position(): number {
    return this.#position.current;
  }

  /** Rolls to `digit`. Only a new digit starts a roll. */
  public show(digit: number, { direction, spin, delay, instant }: RollOptions): void {
    if (this.#shown === digit) return;
    this.#shown = digit;
    const id = ++this.#generation;
    if (instant) {
      this.#jump(digit);
      return;
    }
    // Every lap looks the same, so re-centre (keeping any fraction) to always have room to roll.
    this.#jump(HOME + (this.#position.current % RollingMath.LAP));
    const motion = SvelteMotion.of(spin > 0 ? "large" : "move");
    const landing = new RollingDigit(digit, direction, spin).landingFrom(this.#position.current);
    this.#position.set(landing, { ...motion, delay: delay * 1000 }).then(
      () => {
        if (id === this.#generation) this.#jump(digit);
      },
      () => {},
    );
  }

  /** Sets the lap at once. A zero-length set has no roll to wait for, so nothing waits on it. */
  #jump(lap: number): void {
    this.#position.set(lap, { duration: 0 }).then(
      () => {},
      () => {},
    );
  }
}
