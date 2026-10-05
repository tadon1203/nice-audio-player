/**
 * What the Meters view shows between two draws: a pure function of the previous display state,
 * the frames that arrived (already reduced) and the real time that passed. Numbers and their
 * sources: `docs/research/spectrum-analyzer-meter-ballistics.md`.
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

/** What one draw is fed: the frames since the last draw, reduced (see `reduceFrames`). */
export type MeterInput = {
  bands: readonly number[];
  peak: readonly [number, number];
  rms: readonly [number, number];
  /** Per channel: a sample reached full scale. */
  clip: readonly [boolean, boolean];
};

/** A Level bar with its Peak cap: `level` is the filled bar, `peakCap` the held peak (never below `level`). */
export type LevelBar = { level: number; peakCap: number; peakHoldLeft: number };

export type DisplayState = {
  bands: readonly LevelBar[];
  /** The Level meter's peak bars, left and right. */
  peak: readonly [LevelBar, LevelBar];
  /** The Level meter's RMS levels, left and right. */
  rms: readonly [number, number];
  /** Seconds of "Clip" left, per channel; 0 when not latched. */
  clipLeft: readonly [number, number];
  /** Whether "Clip" is shown, per channel. */
  clip: readonly [boolean, boolean];
};

const { floorDb, ceilingDb } = BALLISTICS;

const emptyLevelBar = (): LevelBar => ({ level: floorDb, peakCap: floorDb, peakHoldLeft: 0 });

/** The floor everywhere: what opening the view starts from. */
export function initialDisplay(): DisplayState {
  return {
    bands: Array.from({ length: BAND_COUNT }, emptyLevelBar),
    peak: [emptyLevelBar(), emptyLevelBar()],
    rms: [floorDb, floorDb],
    clipLeft: [0, 0],
    clip: [false, false],
  };
}

const clampDb = (db: number) => Math.min(ceilingDb, Math.max(floorDb, db));

/** Instant rise, linear fall in dB. */
function fall(level: number, target: number, rate: number, dt: number): number {
  const goal = clampDb(target);
  return goal >= level ? goal : Math.max(goal, level - rate * dt);
}

function stepLevelBar(bar: LevelBar, target: number, rate: number, dt: number): LevelBar {
  const level = fall(bar.level, target, rate, dt);
  if (level >= bar.peakCap) {
    return { level, peakCap: level, peakHoldLeft: level > floorDb ? BALLISTICS.peakHoldS : 0 };
  }
  const held = Math.min(bar.peakHoldLeft, dt);
  const falling = dt - held;
  return {
    level,
    peakCap: Math.max(level, bar.peakCap - BALLISTICS.peakCapFallDbPerS * falling),
    peakHoldLeft: bar.peakHoldLeft - held,
  };
}

/**
 * One draw. `input` is `null` when there is nothing to show (paused, stopped, no frame): the
 * bars fall to the floor by the same rules. `elapsedS` is real time since the last draw.
 */
export function stepDisplay(
  state: DisplayState,
  input: MeterInput | null,
  elapsedS: number,
): DisplayState {
  const dt = Math.min(BALLISTICS.maxElapsedS, Math.max(0, elapsedS));
  const { spectrumFallDbPerS: spectrumRate, levelFallDbPerS: levelRate } = BALLISTICS;
  const clipLeft = [0, 1].map((channel) =>
    input?.clip[channel] ? BALLISTICS.clipWarningS : Math.max(0, state.clipLeft[channel]! - dt),
  ) as [number, number];
  return {
    bands: state.bands.map((bar, i) =>
      stepLevelBar(bar, input?.bands[i] ?? floorDb, spectrumRate, dt),
    ),
    peak: [
      stepLevelBar(state.peak[0], input?.peak[0] ?? floorDb, levelRate, dt),
      stepLevelBar(state.peak[1], input?.peak[1] ?? floorDb, levelRate, dt),
    ],
    rms: [
      fall(state.rms[0], input?.rms[0] ?? floorDb, levelRate, dt),
      fall(state.rms[1], input?.rms[1] ?? floorDb, levelRate, dt),
    ],
    clipLeft,
    clip: [clipLeft[0] > 0, clipLeft[1] > 0],
  };
}

/** Clicking "Clip" clears it for that channel. */
export function clearClip(state: DisplayState, channel: 0 | 1): DisplayState {
  const clipLeft: [number, number] = [state.clipLeft[0], state.clipLeft[1]];
  clipLeft[channel] = 0;
  return { ...state, clipLeft, clip: [clipLeft[0] > 0, clipLeft[1] > 0] };
}
