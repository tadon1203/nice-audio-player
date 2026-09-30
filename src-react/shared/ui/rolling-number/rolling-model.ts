export type RollDirection = "up" | "down";

/** Signed digit steps to roll from one digit to another without running backwards across 9 → 0. */
export function rollDelta(prevDigit: number, nextDigit: number, direction: RollDirection): number {
  const up = (nextDigit - prevDigit + 10) % 10;
  if (direction === "up") return up;
  return up === 0 ? 0 : up - 10;
}

/** Which way a value moved, from the numbers the strings show; `up` when they can't be compared. */
export function resolveDirection(prev: string, next: string): RollDirection {
  const a = Number(prev.replace(/[^0-9]/g, ""));
  const b = Number(next.replace(/[^0-9]/g, ""));
  return b < a ? "down" : "up";
}

/** Extra full turns for a jump of `deltaMs`: one per 30 s, at most 3. */
export function spinTurns(deltaMs: number): number {
  return Math.min(3, Math.floor(Math.abs(deltaMs) / 30_000));
}

/** Delay before the digit `index` places from the right settles (the slot-machine stagger). */
export function settleDelay(index: number, mode: "together" | "right-last"): number {
  return mode === "right-last" ? index * 0.04 : 0;
}

const LAP = 10;
/** The digit column holds this many 0–9 laps; a roll starts from the middle so it has room both ways. */
export const COLUMN_LAPS = 7;
export const COLUMN_HOME_LAP = 3;

/** Where a digit column ends up when it rolls from `current` to `nextDigit`, `spin` extra laps included. */
export function rollTarget(
  current: number,
  nextDigit: number,
  direction: RollDirection,
  spin: number,
): number {
  const turns = Math.min(2, Math.max(0, Math.floor(spin))) * LAP;
  if (direction === "up") {
    return current + ((((nextDigit - current) % LAP) + LAP) % LAP) + (turns > 0 ? turns : 0);
  }
  return current - ((((current - nextDigit) % LAP) + LAP) % LAP) - turns;
}
