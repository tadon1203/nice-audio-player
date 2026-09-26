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
