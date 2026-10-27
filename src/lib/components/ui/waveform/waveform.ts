/** Pixels per bar (bar plus gap). Buckets are merged so the drawing never gets denser. */
export const BAR_PITCH_PX = 3;

/**
 * Reduces the backend's RMS buckets (0-255) to `count` bars. A span's level is the root of the mean
 * of its squares, never a max or a plain mean, so merging keeps the true average energy.
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

export function barCountForWidth(widthPx: number): number {
  return Math.max(1, Math.floor(widthPx / BAR_PITCH_PX));
}
