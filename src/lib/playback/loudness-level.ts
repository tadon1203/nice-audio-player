import { cubicInOut } from "svelte/easing";
import { tweenNumber } from "$lib/ui/motion/tween-number";
import type { ClockPosition, PlaybackClock } from "./clock";
import { levelAt, smoothLevel } from "./loudness";

/** The level a paused Light rests at: neither dimmed nor at full. */
const PAUSED_LEVEL = 0.5;
/** How long the Light takes to ease to rest when playback pauses. */
const REST_MS = 1200;

export type LoudnessLevelParams = {
  rms: readonly number[] | null;
  durationMs: number | null;
  playing: boolean;
  enabled: boolean;
};

/**
 * A 0-1 loudness that follows the playing position over the track's energy, smoothed so the
 * Light breathes instead of flickering (see `loudness.ts`). No audio is analysed here; the
 * levels are already loaded for the waveform. It has no frame loop of its own: it steps
 * whenever the playback clock's `position` moves, so it costs nothing while paused or while
 * nothing draws the level (`enabled` false), and eases to a middle level when paused.
 */
export function createLoudnessLevel({
  clock,
  ...initial
}: { clock: Pick<PlaybackClock, "position"> } & LoudnessLevelParams) {
  let params: LoudnessLevelParams = initial;
  let current = PAUSED_LEVEL;
  let lastStepAt: number | null = null;
  let rest: { stop: () => void } | null = null;
  const listeners = new Set<(value: number) => void>();

  const set = (value: number) => {
    current = value;
    listeners.forEach((listener) => listener(value));
  };

  const level: ClockPosition = {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };

  const stopRest = () => {
    rest?.stop();
    rest = null;
  };

  const syncRest = () => {
    lastStepAt = null;
    stopRest();
    if (!params.enabled || params.playing) return;
    rest = tweenNumber(current, PAUSED_LEVEL, {
      duration: REST_MS,
      easing: cubicInOut,
      onUpdate: set,
    });
  };

  const unsubscribe = clock.position.subscribe((positionMs) => {
    if (!params.enabled || !params.playing) return;
    const now = performance.now();
    const elapsed = lastStepAt === null ? 0 : now - lastStepAt;
    lastStepAt = now;
    const target = levelAt(params.rms, positionMs, params.durationMs);
    set(smoothLevel(current, target, elapsed));
  });

  syncRest();

  return {
    level,
    /** Call whenever an input changes. */
    update(next: LoudnessLevelParams) {
      const restChanged = next.playing !== params.playing || next.enabled !== params.enabled;
      params = next;
      if (restChanged) syncRest();
    },
    destroy() {
      unsubscribe();
      stopRest();
      listeners.clear();
    },
  };
}
