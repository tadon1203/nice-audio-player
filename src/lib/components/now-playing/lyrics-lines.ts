import type { LyricsTimedLine } from "$lib/native";

/**
 * The index of the current line: the last line whose `startMs` is at or before `positionMs`, or
 * -1 if playback hasn't reached the first line yet. Binary search, since lines are sorted
 * ascending by `startMs`.
 */
export function findCurrentLineIndex(
  lines: readonly LyricsTimedLine[],
  positionMs: number,
): number {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid]!.startMs <= positionMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/** A first line this late leaves an intro long enough to show as a gap of its own. */
const INTRO_MIN_MS = 3_000;

/**
 * The lines with an empty one at 0ms in front when the first line starts at 3s or later, so the
 * intro is an instrumental gap (with its bar) instead of nothing. Returns `lines` itself when
 * there is no such intro.
 */
export function withIntro(lines: readonly LyricsTimedLine[]): readonly LyricsTimedLine[] {
  const first = lines[0];
  if (first === undefined || first.startMs < INTRO_MIN_MS) return lines;
  return [{ startMs: 0, text: "" }, ...lines];
}

/** A line's time span, for lighting it on the dock waveform. */
export function lineSpan(
  lines: readonly LyricsTimedLine[],
  index: number,
  durationMs: number | null,
): { startMs: number; endMs: number } | null {
  const line = lines[index];
  if (line === undefined) return null;
  const next = lines[index + 1];
  return { startMs: line.startMs, endMs: next?.startMs ?? durationMs ?? line.startMs };
}

/** How far through an instrumental gap the position is, 0 to 1 (0 for a gap with no length). */
export function gapProgress(positionMs: number, startMs: number, endMs: number | null): number {
  if (endMs === null || endMs <= startMs) return 0;
  return Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs)));
}
