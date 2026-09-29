import { useEffect, useRef, useState } from "react";
import type { LyricsTimedLine } from "@/shared/ipc";

/**
 * Finds the index of the current line: the last line whose `startMs` is at or before
 * `positionMs`, or -1 if playback hasn't reached the first line yet. Binary search since lines
 * are sorted ascending by `startMs`.
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

/** The current line's time span, for lighting it on the dock waveform. */
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

/** Time a line takes to fill: at least this long, however short the line is. */
const MIN_FILL_MS = 2_000;
/** Extra fill time per character, so long lines are not swept faster than they can be read. */
const FILL_MS_PER_CHAR = 150;

/**
 * How long the lit fill takes to cross a line. A line lasts until the next one starts, but a
 * line followed by a long instrumental gap should not crawl through it, so the fill is capped
 * by a reading-speed estimate and then waits, fully lit.
 */
export function lineFillMs(spanMs: number, text: string): number {
  return Math.min(Math.max(0, spanMs), MIN_FILL_MS + text.length * FILL_MS_PER_CHAR);
}

/** How much of a line is lit (0-1) at `positionMs`, filling over `fillMs` from `startMs`. */
export function lineProgress(positionMs: number, startMs: number, fillMs: number): number {
  if (fillMs <= 0) return positionMs >= startMs ? 1 : 0;
  return Math.min(1, Math.max(0, (positionMs - startMs) / fillMs));
}

/** Past this many characters a line only fades in; the per-character lift is skipped. */
export const MAX_LIFT_CHARS = 100;
/** How far a character rises when it lights, in px, and how long it takes to settle back. */
const LIFT_PX = 2;
const LIFT_SETTLE_MS = 200;

/** How lit character `index` of `count` is (0-1) when the whole line is `progress` lit: each takes its own slice, in order. */
export function charOpacity(progress: number, index: number, count: number): number {
  return Math.min(1, Math.max(0, progress * count - index));
}

/** The upward offset in px (negative is up) of a character: it jumps as it lights, then settles over 200ms. */
export function charLift(progress: number, index: number, count: number, fillMs: number): number {
  const since = progress * count - index;
  if (since <= 0 || fillMs <= 0) return 0;
  const elapsedMs = (since / count) * fillMs;
  if (elapsedMs >= LIFT_SETTLE_MS) return 0;
  return -LIFT_PX * (1 - elapsedMs / LIFT_SETTLE_MS);
}

/**
 * Tracks the current lyric line index from a `{positionMs, performance.now()}` anchor,
 * interpolating while playing and freezing while paused. Recomputes on every new position
 * snapshot (covers seeks and track changes) and otherwise advances via a single `setTimeout`
 * armed for the next line's start time, rather than polling every frame.
 */
export function useLyricsSync(
  lines: readonly LyricsTimedLine[] | null,
  positionMs: number,
  isPlaying: boolean,
): number {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (lines === null || lines.length === 0) {
      setCurrentIndex(-1);
      return;
    }

    const anchor = { positionMs, perfNow: performance.now() };
    const tick = () => {
      const estimated = isPlaying
        ? anchor.positionMs + (performance.now() - anchor.perfNow)
        : anchor.positionMs;
      const index = findCurrentLineIndex(lines, estimated);
      setCurrentIndex(index);
      if (!isPlaying) return;
      const next = lines[index + 1];
      if (next === undefined) return;
      timerRef.current = setTimeout(tick, Math.max(0, next.startMs - estimated));
    };
    tick();

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [lines, positionMs, isPlaying]);

  return currentIndex;
}
