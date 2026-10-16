import { levelToUnit } from "#lib/ui/waveform/waveform-model";

/** How loud a track is over its length, one value per waveform bucket. */
export class TrackEnergy {
  static readonly #cache = new WeakMap<readonly number[], Float32Array>();

  /**
   * How loud a track is over its length, 0-1 on the dB scale of the waveform bars (see
   * `levelToUnit`), one value per waveform bucket. Peaks sit near full scale in most masters and
   * would not move, so everything that shows a track's energy (the bars, the Artwork glow's breathing)
   * reads RMS on this one scale. Computed once per waveform and remembered.
   */
  public static of(rms: readonly number[] | null): Float32Array | null {
    if (rms === null || rms.length === 0) return null;
    let energy = TrackEnergy.#cache.get(rms);
    if (energy === undefined) {
      energy = Float32Array.from(rms, levelToUnit);
      TrackEnergy.#cache.set(rms, energy);
    }
    return energy;
  }

  /** The energy at `share` (0-1) of the way through the track; 0 when unknown. */
  public static at(energy: Float32Array | null, share: number): number {
    if (energy === null) return 0;
    const clamped = Math.min(1, Math.max(0, share));
    return energy[Math.min(energy.length - 1, Math.floor(clamped * energy.length))] ?? 0;
  }
}
