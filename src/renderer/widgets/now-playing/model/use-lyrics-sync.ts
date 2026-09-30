import { useEffect, useState } from "react";
import type { LyricsTimedLine } from "@/shared/ipc";
import { playbackClock } from "@/renderer/entities/playback";

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

/** A first line this late leaves an intro long enough to show as a gap of its own. */
const INTRO_MIN_MS = 3_000;

/**
 * The lines with an empty one at 0ms in front when the first line starts at 3s or later, so
 * the intro is an instrumental gap (with its bar) instead of nothing. Returns `lines` itself
 * when there is no such intro.
 */
export function withIntro(lines: readonly LyricsTimedLine[]): readonly LyricsTimedLine[] {
  const first = lines[0];
  if (first === undefined || first.startMs < INTRO_MIN_MS) return lines;
  return [{ startMs: 0, text: "" }, ...lines];
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
 * Tracks the current lyric line index from the playback clock. It re-reads the clock whenever
 * a report reaches it (covers seeks, track changes, pauses) and otherwise advances with a
 * single `setTimeout` armed for the next line's start, so the component re-renders only when
 * the line changes, never with the position.
 */
export function useLyricsSync(lines: readonly LyricsTimedLine[] | null): number {
  // Start from where the clock is now, so a panel opened mid-song does not begin at line 0.
  const [currentIndex, setCurrentIndex] = useState(() =>
    lines === null || lines.length === 0
      ? -1
      : findCurrentLineIndex(lines, playbackClock.estimate()),
  );

  useEffect(() => {
    if (lines === null || lines.length === 0) {
      setCurrentIndex(-1);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const estimated = playbackClock.estimate();
      const index = findCurrentLineIndex(lines, estimated);
      setCurrentIndex(index);
      if (!playbackClock.playing()) return;
      const next = lines[index + 1];
      if (next === undefined) return;
      timer = setTimeout(arm, Math.max(0, next.startMs - estimated));
    };
    arm();
    const stopListening = playbackClock.onReport(arm);
    return () => {
      clearTimeout(timer);
      stopListening();
    };
  }, [lines]);

  return currentIndex;
}
