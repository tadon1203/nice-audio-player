import { untrack } from "svelte";
import type { LyricsTimedLine } from "$lib/native";
import { getPlayback } from "$lib/playback/context";
import { findCurrentLineIndex } from "./lyrics-lines";

/**
 * Tracks the current lyric line index from the playback clock. It re-reads the clock whenever a
 * report reaches it (covers seeks, track changes, pauses) and otherwise advances with a single
 * `setTimeout` armed for the next line's start, so readers rerun only when the line changes,
 * never with the position. Call it while a component initialises.
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const estimated = clock.estimate();
      const found = findCurrentLineIndex(current, estimated);
      index = found;
      if (!clock.playing()) return;
      const next = current[found + 1];
      if (next === undefined) return;
      timer = setTimeout(arm, Math.max(0, next.startMs - estimated));
    };
    arm();
    const stopListening = clock.onReport(arm);
    return () => {
      clearTimeout(timer);
      stopListening();
    };
  });

  return {
    get index() {
      return index;
    },
  };
}
