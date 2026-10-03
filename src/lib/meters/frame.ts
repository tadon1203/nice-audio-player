import { BAND_COUNT, type MeterInput } from "./ballistics";

/** One Meter frame as the backend measured it (layout: `FRAME_BYTES` in `backend/src/audio/meter.rs`). */
export type MeterFrame = {
  bands: readonly number[];
  peak: readonly [number, number];
  rms: readonly [number, number];
  /** A sample reached full scale in this frame. */
  fullScale: boolean;
};

const FLOATS = BAND_COUNT + 4;
const FRAME_BYTES = (FLOATS + 1) * 4;
const FLAG_FULL_SCALE = 1;
/** A channel whose peak is this close to 0 dBFS and whose frame says full scale has clipped. */
const CLIP_PEAK_DB = -0.1;

/** Reads a frame off the wire; `null` for a message of the wrong size. */
export function decodeMeterFrame(buffer: ArrayBuffer): MeterFrame | null {
  if (buffer.byteLength !== FRAME_BYTES) return null;
  const view = new DataView(buffer);
  const float = (index: number) => view.getFloat32(index * 4, true);
  return {
    bands: Array.from({ length: BAND_COUNT }, (_, i) => float(i)),
    peak: [float(BAND_COUNT), float(BAND_COUNT + 1)],
    rms: [float(BAND_COUNT + 2), float(BAND_COUNT + 3)],
    fullScale: (view.getUint32(FLOATS * 4, true) & FLAG_FULL_SCALE) !== 0,
  };
}

/**
 * The frames since the last draw as one input: the maximum of each band and each peak, so no
 * short peak is lost between a frame and a draw; RMS follows the latest frame. `null` for none.
 */
export function reduceFrames(frames: readonly MeterFrame[]): MeterInput | null {
  const last = frames.at(-1);
  if (last === undefined) return null;
  const bands = Array.from({ length: BAND_COUNT }, (_, i) =>
    Math.max(...frames.map((frame) => frame.bands[i]!)),
  );
  const peak: [number, number] = [
    Math.max(...frames.map((frame) => frame.peak[0])),
    Math.max(...frames.map((frame) => frame.peak[1])),
  ];
  const clip: [boolean, boolean] = [false, false];
  for (const frame of frames) {
    if (!frame.fullScale) continue;
    if (frame.peak[0] >= CLIP_PEAK_DB) clip[0] = true;
    if (frame.peak[1] >= CLIP_PEAK_DB) clip[1] = true;
  }
  return { bands, peak, rms: last.rms, clip };
}
