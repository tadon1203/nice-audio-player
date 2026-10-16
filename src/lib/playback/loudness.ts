import { TrackEnergy } from "#lib/playback/track-energy";

/** The smoothed loudness (0-1) at a position in the track. */
export type LoudnessKeyframe = { atMs: number; level: number };

/** The Artwork glow's loudness, smoothed over time. Pure: nothing is stored here. */
export class Loudness {
  /** Slow on purpose: the Artwork glow follows the passage (a chorus brightening it), not each beat. */
  public static readonly ATTACK_MS = 700;
  public static readonly RELEASE_MS = 1_800;

  /** One step of a one-pole low-pass: quick to rise (attack), slow to fall (release). */
  public static smooth(current: number, target: number, dtMs: number): number {
    const tau = target > current ? Loudness.ATTACK_MS : Loudness.RELEASE_MS;
    return current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
  }

  /**
   * The Artwork glow's loudness over the whole track, smoothed once, forward in time, at the waveform's
   * own resolution (one keyframe per bucket, each at the bucket's start). Empty without a waveform
   * or a duration. Linear interpolation between keyframes is what the compositor draws.
   */
  public static keyframes(
    rms: readonly number[] | null,
    durationMs: number | null,
  ): LoudnessKeyframe[] {
    const energy = TrackEnergy.of(rms);
    if (energy === null || durationMs === null || durationMs <= 0) return [];
    const bucketMs = durationMs / energy.length;
    const keyframes: LoudnessKeyframe[] = [];
    let level = 0;
    energy.forEach((target, index) => {
      level = Loudness.smooth(level, target, index === 0 ? 0 : bucketMs);
      keyframes.push({ atMs: index * bucketMs, level });
    });
    return keyframes;
  }
}
