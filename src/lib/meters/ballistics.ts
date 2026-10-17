/**
 * What the Meters view shows between two draws: a pure function of the previous display state,
 * the frames that arrived (already reduced) and the real time that passed. Numbers and their
 * sources: `docs/research/spectrum-analyzer-meter-ballistics.md`. The display itself is
 * `MeterDisplay` in `meter-display.ts`.
 */

/** Every constant of the display's motion, in one place. Levels are dBFS, times are seconds. */
export const BALLISTICS = {
  floorDb: -90,
  ceilingDb: 0,
  /** Spectrum bars rise instantly and fall at this rate. */
  spectrumFallDbPerS: 30,
  /** Level meter bars (peak and RMS): EBU Tech 3205-E return rate. */
  levelFallDbPerS: 8.6,
  /** A Peak cap holds this long after its Level bar last touched it, then falls. */
  peakHoldS: 1.5,
  peakCapFallDbPerS: 10,
  /** "Clip" stays this long, and starts over on a new clip. */
  clipWarningS: 2,
  /** One step never covers more time than this, so a stalled draw does not jump. */
  maxElapsedS: 0.1,
} as const;

export const BAND_COUNT = 30;

/** What one draw is fed: the frames since the last draw, reduced (see `MeterFrames.reduce`). */
export interface MeterInput {
  bands: readonly number[];
  peak: readonly [number, number];
  rms: readonly [number, number];
  /** Per channel: a sample reached full scale. */
  clip: readonly [boolean, boolean];
}

/** A Level bar with its Peak cap: `level` is the filled bar, `peakCap` the held peak (never below `level`). */
export interface LevelBar {
  level: number;
  peakCap: number;
  peakHoldLeft: number;
}
