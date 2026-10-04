import { untrack } from "svelte";
import type { LyricsTimedLine } from "$lib/native";
import { getPlayback } from "$lib/playback/context";
import { findCurrentLineIndex } from "./lyrics-lines";

/**
 * Tracks the current lyric line index from the playback clock. It rides the clock's boundary: the
 * clock wakes it on every report (covers seeks, track changes, pauses) and at the next line's
 * start, so readers rerun only when the line changes, never with the position. Call it while a component initialises.
 */
export function createLyricsSync(lines: () => readonly LyricsTimedLine[] | null) {
  const { clock } = getPlayback();

  // Start from where the clock is now, so a panel opened mid-song does not begin at line 0.
  let index = $state.raw(
    untrack(() => {
      const current = lines();
      return current === null || current.length === 0
        ? -1
        : findCurrentLineIndex(current, clock.estimate());
    }),
  );

  $effect(() => {
    const current = lines();
    if (current === null || current.length === 0) {
      index = -1;
      return;
    }
    return clock.onBoundary(
      (positionMs) => current[findCurrentLineIndex(current, positionMs) + 1]?.startMs ?? null,
      (positionMs) => (index = findCurrentLineIndex(current, positionMs)),
    );
  });

  return {
    get index() {
      return index;
    },
    /** Ms until the next line starts; null when there is none or the clock is not playing. */
    msToNextLine(): number | null {
      const current = lines();
      if (current === null || !clock.playing()) return null;
      const next = current[index + 1];
      return next === undefined ? null : Math.max(0, next.startMs - clock.estimate());
    },
  };
}
