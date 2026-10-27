import { BALLISTICS, BAND_COUNT, type LevelBar, type MeterInput } from "./ballistics";

const { floorDb, ceilingDb } = BALLISTICS;

const emptyLevelBar = (): LevelBar => ({ level: floorDb, peakCap: floorDb, peakHoldLeft: 0 });

const clampDb = (db: number): number => Math.min(ceilingDb, Math.max(floorDb, db));

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

/** The fields of a MeterDisplay: what the display shows at one moment. */
export interface MeterDisplayState {
  bands: readonly LevelBar[];
  peak: readonly [LevelBar, LevelBar];
  rms: readonly [number, number];
  clipLeft: readonly [number, number];
  clip: readonly [boolean, boolean];
}

/** What the display shows at one moment. Each draw makes a new one; a value is never changed. */
export class MeterDisplay {
  /** The Spectrum's bars. */
  public readonly bands: readonly LevelBar[];
  /** The Level meter's peak bars, left and right. */
  public readonly peak: readonly [LevelBar, LevelBar];
  /** The Level meter's RMS levels, left and right. */
  public readonly rms: readonly [number, number];
  /** Seconds of "Clip" left, per channel; 0 when not latched. */
  public readonly clipLeft: readonly [number, number];
  /** Whether "Clip" is shown, per channel. */
  public readonly clip: readonly [boolean, boolean];

  public constructor(state: MeterDisplayState) {
    this.bands = state.bands;
    this.peak = state.peak;
    this.rms = state.rms;
    this.clipLeft = state.clipLeft;
    this.clip = state.clip;
  }

  /** The floor everywhere: what opening the view starts from. */
  public static initial(): MeterDisplay {
    return new MeterDisplay({
      bands: Array.from({ length: BAND_COUNT }, emptyLevelBar),
      peak: [emptyLevelBar(), emptyLevelBar()],
      rms: [floorDb, floorDb],
      clipLeft: [0, 0],
      clip: [false, false],
    });
  }

  /**
   * One draw. `input` is `null` when there is nothing to show (paused, stopped, no frame): the
   * bars fall to the floor by the same rules. `elapsedS` is real time since the last draw.
   */
  public step(input: MeterInput | null, elapsedS: number): MeterDisplay {
    const dt = Math.min(BALLISTICS.maxElapsedS, Math.max(0, elapsedS));
    const { spectrumFallDbPerS: spectrumRate, levelFallDbPerS: levelRate } = BALLISTICS;
    const clipLeft = [0, 1].map((channel) =>
      input?.clip[channel] ? BALLISTICS.clipWarningS : Math.max(0, this.clipLeft[channel]! - dt),
    ) as [number, number];
    return new MeterDisplay({
      bands: this.bands.map((bar, i) =>
        stepLevelBar(bar, input?.bands[i] ?? floorDb, spectrumRate, dt),
      ),
      peak: [
        stepLevelBar(this.peak[0], input?.peak[0] ?? floorDb, levelRate, dt),
        stepLevelBar(this.peak[1], input?.peak[1] ?? floorDb, levelRate, dt),
      ],
      rms: [
        fall(this.rms[0], input?.rms[0] ?? floorDb, levelRate, dt),
        fall(this.rms[1], input?.rms[1] ?? floorDb, levelRate, dt),
      ],
      clipLeft,
      clip: [clipLeft[0] > 0, clipLeft[1] > 0],
    });
  }

  /** Clicking "Clip" clears it for that channel. */
  public clearClip(channel: 0 | 1): MeterDisplay {
    const clipLeft: [number, number] = [this.clipLeft[0], this.clipLeft[1]];
    clipLeft[channel] = 0;
    return new MeterDisplay({
      bands: this.bands,
      peak: this.peak,
      rms: this.rms,
      clipLeft,
      clip: [clipLeft[0] > 0, clipLeft[1] > 0],
    });
  }

  /** Whether every bar and Peak cap is at the floor and no "Clip" shows: there is nothing to draw. */
  public isAtRest(): boolean {
    const resting = (bar: LevelBar): boolean => bar.level <= floorDb && bar.peakCap <= floorDb;
    return (
      this.bands.every(resting) &&
      resting(this.peak[0]) &&
      resting(this.peak[1]) &&
      this.rms[0] <= floorDb &&
      this.rms[1] <= floorDb &&
      !this.clip[0] &&
      !this.clip[1]
    );
  }
}

/** A held peak as text: dBFS with one decimal, "-inf" at the floor. */
export function formatHeldPeak(db: number): string {
  if (db < floorDb + 0.05) return "-inf";
  const text = db.toFixed(1);
  return text === "-0.0" ? "0.0" : text;
}
