import { useAnimationFrame, useMotionValue, type MotionValue } from "motion/react";
import { levelAt, smoothLevel } from "./loudness";

/** The level a paused Light rests at: neither dimmed nor at full. */
const PAUSED_LEVEL = 0.5;

/**
 * A 0-1 loudness that follows the playing position over the waveform's peaks, smoothed so the
 * Light breathes instead of flickering (see `loudness.ts`). No audio is analysed here; the
 * peaks are already loaded for the waveform. Frozen at a middle level while paused.
 */
export function useLoudnessLevel(
  peaks: readonly number[] | null,
  position: MotionValue<number>,
  durationMs: number | null,
  playing: boolean,
): MotionValue<number> {
  const level = useMotionValue(PAUSED_LEVEL);
  useAnimationFrame((_, deltaMs) => {
    const target = playing ? levelAt(peaks, position.get(), durationMs) : PAUSED_LEVEL;
    level.set(smoothLevel(level.get(), target, deltaMs));
  });
  return level;
}
