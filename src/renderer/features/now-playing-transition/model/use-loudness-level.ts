import { useEffect, useRef } from "react";
import { animate, useMotionValue, useMotionValueEvent, type MotionValue } from "motion/react";
import { levelAt, smoothLevel } from "./loudness";

/** The level a paused Light rests at: neither dimmed nor at full. */
const PAUSED_LEVEL = 0.5;
/** How long the Light takes to ease to rest when playback pauses. */
const REST_S = 1.2;

/**
 * A 0-1 loudness that follows the playing position over the track's energy, smoothed so the
 * Light breathes instead of flickering (see `loudness.ts`). No audio is analysed here; the
 * levels are already loaded for the waveform. It has no frame loop of its own: it steps
 * whenever the playback clock's `position` moves, so it costs nothing while paused or while
 * nothing draws the level (`enabled` false), and eases to a middle level when paused.
 */
export function useLoudnessLevel(
  rms: readonly number[] | null,
  position: MotionValue<number>,
  durationMs: number | null,
  playing: boolean,
  enabled = true,
): MotionValue<number> {
  const level = useMotionValue(PAUSED_LEVEL);
  const latest = useRef({ rms, durationMs });
  useEffect(() => {
    latest.current = { rms, durationMs };
  });
  const lastStepAt = useRef<number | null>(null);

  useMotionValueEvent(position, "change", (positionMs) => {
    if (!enabled || !playing) return;
    const now = performance.now();
    const elapsed = lastStepAt.current === null ? 0 : now - lastStepAt.current;
    lastStepAt.current = now;
    const target = levelAt(latest.current.rms, positionMs, latest.current.durationMs);
    level.set(smoothLevel(level.get(), target, elapsed));
  });

  useEffect(() => {
    lastStepAt.current = null;
    if (!enabled || playing) return;
    const rest = animate(level, PAUSED_LEVEL, { duration: REST_S, ease: "easeInOut" });
    return () => rest.stop();
  }, [playing, enabled, level]);

  return level;
}
