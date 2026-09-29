/** The loudness (0-1) at `positionMs`, from the waveform's peaks (0-255). 0 when unknown. */
export function levelAt(
  peaks: readonly number[] | null,
  positionMs: number,
  durationMs: number | null,
): number {
  if (peaks === null || peaks.length === 0 || durationMs === null || durationMs <= 0) return 0;
  const share = Math.min(1, Math.max(0, positionMs / durationMs));
  const index = Math.min(peaks.length - 1, Math.floor(share * peaks.length));
  return (peaks[index] ?? 0) / 255;
}

export const ATTACK_MS = 80;
export const RELEASE_MS = 400;

/** One step of a one-pole low-pass: quick to rise (attack), slow to fall (release). */
export function smoothLevel(current: number, target: number, dtMs: number): number {
  const tau = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
}
