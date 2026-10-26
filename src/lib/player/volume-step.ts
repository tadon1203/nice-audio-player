/**
 * Volume as decibels, the steps the wheel and the keys take, and the slider's scale. Pure: every
 * method is a calculation on its arguments.
 */
export class VolumeStep {
  static readonly #FLOOR_DB = -60;

  /** The volume slider spans this many dB below 0 dB; its left end is silence. */
  public static readonly SLIDER_MAX = -VolumeStep.#FLOOR_DB;

  /** Linear volume (0-1) as decibels; silence is negative infinity. */
  public static volumeToDb(volume: number): number {
    return volume <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(volume);
  }

  public static formatDb(volume: number, muted: boolean): string {
    if (muted || volume <= 0) return "−∞ dB";
    const db = VolumeStep.volumeToDb(volume);
    return `${db.toFixed(1).replace("-", "−")} dB`;
  }

  /**
   * Moves the volume by whole decibels for the wheel over the volume slider: `+1` is louder.
   * The top is 0 dB; below -60 dB the next step down is silence.
   */
  public static step(volume: number, direction: 1 | -1): number {
    const db = VolumeStep.volumeToDb(volume);
    if (direction === 1) {
      if (db === Number.NEGATIVE_INFINITY) return 10 ** (VolumeStep.#FLOOR_DB / 20);
      return Math.min(1, 10 ** ((Math.round(db) + 1) / 20));
    }
    if (db === Number.NEGATIVE_INFINITY) return 0;
    const next = Math.round(db) - 1;
    return next < VolumeStep.#FLOOR_DB ? 0 : 10 ** (next / 20);
  }

  /** Slider position (whole dB above the floor, 0 = silence) for a linear volume. */
  public static toSlider(volume: number): number {
    if (volume <= 0) return 0;
    return Math.min(
      VolumeStep.SLIDER_MAX,
      Math.max(0, Math.round(VolumeStep.volumeToDb(volume) - VolumeStep.#FLOOR_DB)),
    );
  }

  /** Linear volume for a slider position, so dragging moves in decibels like the wheel does. */
  public static fromSlider(position: number): number {
    if (position <= 0) return 0;
    return 10 ** ((Math.min(position, VolumeStep.SLIDER_MAX) + VolumeStep.#FLOOR_DB) / 20);
  }
}
