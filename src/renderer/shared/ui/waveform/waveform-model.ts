/** Pixels per bar (bar plus gap). Buckets are merged so the drawing never gets denser. */
export const BAR_PITCH_PX = 3;
export const SEEK_KEY_STEP_MS = 5_000;

/**
 * Reduces the backend's RMS buckets (0-255) to `count` bars. A span's level is the root of the
 * mean of its squares, never a max or a plain mean, so merging keeps the true average energy.
 */
export function resampleBars(rms: readonly number[], count: number): number[] {
  if (rms.length === 0 || count <= 0) return [];
  const bars = Math.min(count, rms.length);
  return Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * rms.length) / bars);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * rms.length) / bars));
    let squares = 0;
    for (let index = start; index < end; index += 1) squares += (rms[index] ?? 0) ** 2;
    return Math.sqrt(squares / (end - start));
  });
}

/** The quietest level the bars distinguish from silence, in dBFS. */
export const WAVEFORM_FLOOR_DB = -36;

/** Maps a 0-255 level to 0-1 on a dB scale from [`WAVEFORM_FLOOR_DB`] to full scale. */
export function levelToUnit(level: number): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(Math.min(255, level) / 255);
  return Math.max(0, 1 + db / -WAVEFORM_FLOOR_DB);
}

/** How far from the pointer (px) the bars are magnified while dragging, and the most they widen. */
export const FISHEYE_RADIUS_PX = 48;
export const FISHEYE_MAX_SCALE = 2.2;

/** Horizontal scale of a bar `distancePx` from the pointer: the peak at the pointer, 1 outside the radius. */
export function fisheyeScale(distancePx: number): number {
  const d = Math.abs(distancePx);
  if (d >= FISHEYE_RADIUS_PX) return 1;
  return 1 + (FISHEYE_MAX_SCALE - 1) * (1 - d / FISHEYE_RADIUS_PX);
}

export function barCountForWidth(widthPx: number): number {
  return Math.max(1, Math.floor(widthPx / BAR_PITCH_PX));
}

/** Maps a pointer's x offset inside the bar to a playback position. */
export function positionFromOffset(offsetPx: number, widthPx: number, durationMs: number): number {
  if (widthPx <= 0 || durationMs <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, offsetPx / widthPx)) * durationMs);
}

export function nextSeekPosition(key: string, valueMs: number, durationMs: number): number | null {
  const clamp = (value: number) => Math.min(durationMs, Math.max(0, value));
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(valueMs - SEEK_KEY_STEP_MS);
    case "ArrowRight":
    case "ArrowUp":
      return clamp(valueMs + SEEK_KEY_STEP_MS);
    case "Home":
      return 0;
    case "End":
      return durationMs;
    default:
      return null;
  }
}
