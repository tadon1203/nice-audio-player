/** Shown wherever a value is unknown; never substitute `0` for an unknown value. */
export const MISSING = "—";

/** Formats milliseconds using the compact player time representation. */
export function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  const totalSeconds = Math.floor(Math.max(0, value) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${(minutes % 60).toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/** Formats a sample rate in hertz as kHz. */
export function formatSampleRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  return `${(value / 1000).toFixed(1)} kHz`;
}

/** Formats a count with locale grouping, or the missing marker when unknown. */
export function formatNumber(value: number | null | undefined): string {
  return value == null ? MISSING : value.toLocaleString();
}

/** Formats a count with its noun, using the singular only for exactly one. */
export function formatCount(
  value: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

export type AudioFormatFacts = {
  format: string | null | undefined;
  bitDepth?: number | null;
  sampleRate?: number | null;
  bitrateKbps?: number | null;
};

/** Sample rate in kHz without a unit or trailing zero: `44.1`, `96`. */
export function formatKilohertz(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  return String(Number((value / 1000).toFixed(1)));
}

/**
 * Path notation for a stream (see DESIGN.md): `FLAC 24/96` (codec, bit depth, kHz) for lossless
 * sources, `AAC 256k` (bitrate) for lossy ones. Missing parts are left out, never invented.
 */
export function formatAudioPath({
  format,
  bitDepth,
  sampleRate,
  bitrateKbps,
}: AudioFormatFacts): string {
  const codec = format?.trim().toUpperCase() || null;
  let detail: string | null = null;
  if (bitDepth != null && bitDepth > 0) {
    detail = sampleRate == null ? String(bitDepth) : `${bitDepth}/${formatKilohertz(sampleRate)}`;
  } else if (bitrateKbps != null && bitrateKbps > 0) {
    detail = `${Math.round(bitrateKbps)}k`;
  }
  return [codec, detail].filter((part) => part !== null).join(" ") || MISSING;
}

/** `n of total`, `n` alone when the total is unknown, `null` when there is no number. */
export function formatOfTotal(number: number | null, total: number | null): string | null {
  if (number === null) return null;
  return total === null ? String(number) : `${number} of ${total}`;
}
