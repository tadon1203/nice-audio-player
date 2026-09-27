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
