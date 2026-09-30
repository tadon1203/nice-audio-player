import { energyAt, trackEnergy } from "$lib/playback/track-energy";

/**
 * The loudness (0-1) at `positionMs`, from the waveform's RMS buckets (0-255), on the track
 * energy scale the waveform bars share (see `trackEnergy`). 0 when unknown.
 */
export function levelAt(
  rms: readonly number[] | null,
  positionMs: number,
  durationMs: number | null,
): number {
  if (durationMs === null || durationMs <= 0) return 0;
  return energyAt(trackEnergy(rms), positionMs / durationMs);
}

/** Slow on purpose: the Light follows the passage (a chorus brightening it), not each beat. */
export const ATTACK_MS = 700;
export const RELEASE_MS = 1_800;

/** One step of a one-pole low-pass: quick to rise (attack), slow to fall (release). */
export function smoothLevel(current: number, target: number, dtMs: number): number {
  const tau = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
}
