import { BALLISTICS } from "./ballistics";

/** The Meters readouts as text. */
export class Readout {
  /** A held peak as text: dBFS with one decimal, "-inf" at the floor. */
  public static formatHeldPeak(db: number): string {
    if (db < BALLISTICS.floorDb + 0.05) return "-inf";
    const text = db.toFixed(1);
    return text === "-0.0" ? "0.0" : text;
  }
}
