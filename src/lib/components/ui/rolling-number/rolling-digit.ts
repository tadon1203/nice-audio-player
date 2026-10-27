import { RollingMath, type RollDirection } from "./rolling-math";

const LAP = RollingMath.LAP;

/**
 * One roll of a digit column: the digit it shows next, the way it turns, and how many extra laps
 * it spins (capped at two). A value object: it never changes after it is made.
 */
export class RollingDigit {
  public readonly next: number;
  public readonly direction: RollDirection;
  public readonly spin: number;

  public constructor(next: number, direction: RollDirection, spin: number) {
    this.next = next;
    this.direction = direction;
    this.spin = spin;
  }

  /** Where the column ends up when it rolls from `current`, the spin laps included. */
  public landingFrom(current: number): number {
    const turns = Math.min(2, Math.max(0, Math.floor(this.spin))) * LAP;
    if (this.direction === "up") {
      return current + ((((this.next - current) % LAP) + LAP) % LAP) + turns;
    }
    return current - ((((current - this.next) % LAP) + LAP) % LAP) - turns;
  }
}
