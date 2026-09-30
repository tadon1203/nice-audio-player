const FLOOR_DB = -60;

/** Linear volume (0-1) as decibels; silence is negative infinity. */
export function volumeToDb(volume: number): number {
  return volume <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(volume);
}

export function formatVolumeDb(volume: number, muted: boolean): string {
  if (muted || volume <= 0) return "−∞ dB";
  const db = volumeToDb(volume);
  return `${db.toFixed(1).replace("-", "−")} dB`;
}

/**
 * Moves the volume by whole decibels for the wheel over the volume slider: `+1` is louder.
 * The top is 0 dB; below -60 dB the next step down is silence.
 */
export function stepVolumeDb(volume: number, direction: 1 | -1): number {
  const db = volumeToDb(volume);
  if (direction === 1) {
    if (db === Number.NEGATIVE_INFINITY) return 10 ** (FLOOR_DB / 20);
    return Math.min(1, 10 ** ((Math.round(db) + 1) / 20));
  }
  if (db === Number.NEGATIVE_INFINITY) return 0;
  const next = Math.round(db) - 1;
  return next < FLOOR_DB ? 0 : 10 ** (next / 20);
}

/** The volume slider spans this many dB below 0 dB; its left end is silence. */
export const VOLUME_SLIDER_MAX = -FLOOR_DB;

/** Slider position (whole dB above the floor, 0 = silence) for a linear volume. */
export function volumeToSlider(volume: number): number {
  if (volume <= 0) return 0;
  return Math.min(VOLUME_SLIDER_MAX, Math.max(0, Math.round(volumeToDb(volume) - FLOOR_DB)));
}

/** Linear volume for a slider position, so dragging moves in decibels like the wheel does. */
export function sliderToVolume(position: number): number {
  if (position <= 0) return 0;
  return 10 ** ((Math.min(position, VOLUME_SLIDER_MAX) + FLOOR_DB) / 20);
}
