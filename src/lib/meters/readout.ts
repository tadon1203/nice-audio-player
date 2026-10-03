import { BALLISTICS } from "./ballistics";

/** A held peak as text: dBFS with one decimal, "-inf" at the floor. */
export function formatHeldPeak(db: number): string {
  if (db < BALLISTICS.floorDb + 0.05) return "-inf";
  const text = db.toFixed(1);
  return text === "-0.0" ? "0.0" : text;
}
