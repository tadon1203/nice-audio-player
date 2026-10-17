import { MISSING } from "./missing";

export interface AudioFormatFacts {
  readonly format: string | null | undefined;
  readonly bitDepth?: number | null;
  readonly sampleRate?: number | null;
  readonly bitrateKbps?: number | null;
}

export class AudioFormatText {
  /** `44.1 kHz`. */
  public static sampleRate(hz: number | null | undefined): string {
    if (hz == null || !Number.isFinite(hz)) return MISSING;
    return `${(hz / 1000).toFixed(1)} kHz`;
  }

  /** `44.1`, `96`: no unit, no trailing zero. */
  public static kilohertz(hz: number | null | undefined): string {
    if (hz == null || !Number.isFinite(hz)) return MISSING;
    return String(Number((hz / 1000).toFixed(1)));
  }

  /**
   * Path notation for a stream (see DESIGN.md): `FLAC 24/96` (codec, bit depth, kHz) for lossless
   * sources, `AAC 256k` (bitrate) for lossy ones. Missing parts are left out, never invented.
   */
  public static path({ format, bitDepth, sampleRate, bitrateKbps }: AudioFormatFacts): string {
    const codec = format?.trim().toUpperCase() || null;
    let detail: string | null = null;
    if (bitDepth != null && bitDepth > 0) {
      detail =
        sampleRate == null
          ? String(bitDepth)
          : `${bitDepth}/${AudioFormatText.kilohertz(sampleRate)}`;
    } else if (bitrateKbps != null && bitrateKbps > 0) {
      detail = `${Math.round(bitrateKbps)}k`;
    }
    return [codec, detail].filter((part) => part !== null).join(" ") || MISSING;
  }
}
