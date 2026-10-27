export type RollDirection = "up" | "down";

/** The calculations of a rolling number. Static only. */
export class RollingMath {
  /** The digits in one lap of a column: 0–9. */
  public static readonly LAP = 10;
  /** The digit column holds this many laps; a roll starts from the middle so it has room both ways. */
  public static readonly LAPS = 7;
  public static readonly HOME_LAP = 3;

  /** Which way a value moved, from the numbers the strings show; `up` when they can't be compared. */
  public static direction(prev: string, next: string): RollDirection {
    const a = Number(prev.replace(/[^0-9]/g, ""));
    const b = Number(next.replace(/[^0-9]/g, ""));
    return b < a ? "down" : "up";
  }

  /** Extra full turns for a jump of `deltaMs`: one per 30 s, at most 3. */
  public static spinTurns(deltaMs: number): number {
    return Math.min(3, Math.floor(Math.abs(deltaMs) / 30_000));
  }

  /** Delay before the digit `index` places from the right settles (the slot-machine stagger). */
  public static settleDelay(index: number, mode: "together" | "right-last"): number {
    return mode === "right-last" ? index * 0.04 : 0;
  }
}
