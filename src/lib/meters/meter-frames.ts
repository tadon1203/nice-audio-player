import type { MeterFrame } from "#lib/native/bindings";
import { BAND_COUNT, type MeterInput } from "./ballistics";

/**
 * The frames since the last draw as one input: the maximum of each band and each peak, so no
 * short peak is lost between a frame and a draw; RMS follows the latest frame, and a channel clips
 * when any frame clipped it. `null` for none.
 */
export function reduceMeterFrames(frames: readonly MeterFrame[]): MeterInput | null {
  const last = frames.at(-1);
  if (last === undefined) return null;
  const bands = Array.from({ length: BAND_COUNT }, (_, i) =>
    Math.max(...frames.map((frame) => frame.bands[i]!)),
  );
  const peak: [number, number] = [
    Math.max(...frames.map((frame) => frame.peak[0])),
    Math.max(...frames.map((frame) => frame.peak[1])),
  ];
  const clip: [boolean, boolean] = [
    frames.some((frame) => frame.clip[0]),
    frames.some((frame) => frame.clip[1]),
  ];
  return { bands, peak, rms: last.rms, clip };
}
