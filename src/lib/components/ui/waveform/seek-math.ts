/** A seek key moves the position this many ms. */
export const SEEK_KEY_STEP_MS = 5_000;
/** Vertical distance (px) from the bar within which a drag still moves the position 1:1. */
const SCRUB_FREE_PX = 24;
/** Each further this many px of distance halves the drag's speed. */
const SCRUB_HALVING_PX = 48;
/** The slowest a drag gets, however far the pointer is from the bar. */
const SCRUB_MIN_GAIN = 1 / 32;
/** Holding Shift while dragging moves at this fraction of the speed. */
const SCRUB_SHIFT_GAIN = 0.1;

/**
 * How much of the pointer's horizontal travel becomes playback travel while dragging. Right on
 * the bar it is 1 (the position follows the pointer); moving the pointer away from the bar
 * slows it, so a long track can be positioned finely by dragging low, and Shift slows it 10x.
 */
export function scrubGain(distanceFromBarPx: number, fine: boolean): number {
  const beyond = Math.max(0, Math.abs(distanceFromBarPx) - SCRUB_FREE_PX);
  const gain = Math.max(SCRUB_MIN_GAIN, 0.5 ** (beyond / SCRUB_HALVING_PX));
  return fine ? gain * SCRUB_SHIFT_GAIN : gain;
}

/** The position after moving `dxPx` from an anchor, at the given gain. The Backend clamps it. */
export function scrubPosition(
  anchorMs: number,
  dxPx: number,
  gain: number,
  widthPx: number,
  durationMs: number,
): number {
  if (widthPx <= 0 || durationMs <= 0) return 0;
  return Math.round(anchorMs + (dxPx / widthPx) * durationMs * gain);
}

/** Maps a pointer's x offset inside the bar to a playback position. */
export function positionFromOffset(offsetPx: number, widthPx: number, durationMs: number): number {
  if (widthPx <= 0 || durationMs <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, offsetPx / widthPx)) * durationMs);
}

/** The position a seek key asks for, from `valueMs`; null for a key that does not seek. */
export function nextSeekPosition(key: string, valueMs: number, durationMs: number): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return valueMs - SEEK_KEY_STEP_MS;
    case "ArrowRight":
    case "ArrowUp":
      return valueMs + SEEK_KEY_STEP_MS;
    case "Home":
      return 0;
    case "End":
      return durationMs;
    default:
      return null;
  }
}
