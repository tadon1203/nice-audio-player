/** Pixels per bar (bar plus gap). Bars are merged by peak so the drawing never gets denser. */
export const BAR_PITCH_PX = 3;
export const SEEK_KEY_STEP_MS = 5_000;

/** Reduces peak buckets to `count` bars, keeping the loudest bucket in each span. */
export function resampleBars(peaks: readonly number[], count: number): number[] {
  if (peaks.length === 0 || count <= 0) return [];
  const bars = Math.min(count, peaks.length);
  return Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * peaks.length) / bars));
    let peak = 0;
    for (let index = start; index < end; index += 1) peak = Math.max(peak, peaks[index] ?? 0);
    return peak;
  });
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
