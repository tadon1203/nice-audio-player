/**
 * The record disc's groove: the track's waveform wound into an Archimedean spiral. The outside
 * is the start of the track and the spiral turns inward, `GROOVE_TURNS` times, however long the
 * track is. All lengths are in the same unit as `rOuter` / `rInner`.
 */
export type Point = readonly [number, number];
/** One unbroken stretch of groove: the outer edge in order, the inner edge in order. */
export type GrooveRun = { outer: Point[]; inner: Point[] };

export const GROOVE_TURNS = 30;
export const SAMPLES_PER_TURN = 360;
/** Peaks quieter than this (of 255) cut the groove: intros, breaks and silence show as dark rings. */
export const SILENCE_PEAK = 10;
/** The thinnest groove, in px, and the widest as a share of the gap between turns. */
const MIN_WIDTH_PX = 0.3;
const MAX_WIDTH_SHARE = 0.8;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Radius of the groove's centre line at time share `t` (0-1). */
export function grooveRadius(t: number, rOuter: number, rInner: number): number {
  return rOuter + (rInner - rOuter) * clamp01(t);
}

/** Width of the groove for a peak (0-255): louder is wider, never touching the next turn. */
export function grooveWidth(peak: number, pitch: number): number {
  return MIN_WIDTH_PX + (MAX_WIDTH_SHARE * pitch - MIN_WIDTH_PX) * clamp01(peak / 255);
}

/**
 * The disc's rotation at time share `t`: `turns` full turns from start to end, so the groove
 * under the fixed needle (at 3 o'clock) is always what is playing now. Degrees, clockwise.
 */
export function discAngle(t: number, turns: number = GROOVE_TURNS): number {
  return clamp01(t) * turns * 360;
}

/**
 * How far the disc visibly turns for a seek from `fromDeg` to `toDeg`, in `direction`
 * (1 forwards, -1 back): one full turn plus whatever is left, instead of the many turns the
 * real angle difference amounts to. It ends on the same angle as the real target.
 */
export function seekSpin(fromDeg: number, toDeg: number, direction: 1 | -1): number {
  const delta = (toDeg - fromDeg) * direction;
  const rest = ((delta % 360) + 360) % 360;
  return direction * (360 + rest);
}

/**
 * The groove as strips around the centre (0, 0), from the peaks 0-255. The spiral runs
 * counter-clockwise from 3 o'clock so that turning the disc clockwise by `discAngle(t)` brings
 * time `t` under the needle. `range` limits it to a stretch of the track, as time shares.
 */
export function grooveStrip(
  peaks: readonly number[],
  turns: number,
  rOuter: number,
  rInner: number,
  samplesPerTurn: number = SAMPLES_PER_TURN,
  range: readonly [number, number] = [0, 1],
): GrooveRun[] {
  if (peaks.length === 0) return [];
  const total = turns * samplesPerTurn;
  const pitch = (rOuter - rInner) / turns;
  const first = Math.max(0, Math.floor(clamp01(range[0]) * total));
  const last = Math.min(total, Math.ceil(clamp01(range[1]) * total));
  const runs: GrooveRun[] = [];
  let run: GrooveRun | null = null;

  for (let j = first; j <= last; j += 1) {
    const from = Math.min(peaks.length - 1, Math.floor((j * peaks.length) / total));
    const to = Math.min(
      peaks.length,
      Math.max(from + 1, Math.floor(((j + 1) * peaks.length) / total)),
    );
    let peak = 0;
    for (let k = from; k < to; k += 1) peak = Math.max(peak, peaks[k] ?? 0);

    if (peak < SILENCE_PEAK) {
      run = null;
      continue;
    }
    const t = j / total;
    const angle = -2 * Math.PI * turns * t;
    const radius = grooveRadius(t, rOuter, rInner);
    const half = grooveWidth(peak, pitch) / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    if (run === null) {
      run = { outer: [], inner: [] };
      runs.push(run);
    }
    run.outer.push([(radius + half) * cos, (radius + half) * sin]);
    run.inner.push([(radius - half) * cos, (radius - half) * sin]);
  }
  return runs;
}
