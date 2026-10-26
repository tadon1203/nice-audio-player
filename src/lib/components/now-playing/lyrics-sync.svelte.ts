import { untrack } from "svelte";
import { type LyricsTimedLine } from "#lib/native/bindings";
import { AppServices } from "#lib/app/app-services.svelte";
import { LyricsLines } from "./lyrics-lines";

/**
 * Tracks the current lyric line index from the playback clock. It rides the clock's boundary: the
 * clock wakes it on every report (covers seeks, track changes, pauses) and at the next line's
 * start, so readers rerun only when the line changes, never with the position. Construct it
 * while a component initialises.
 */
export class LyricsSync {
  readonly #clock = AppServices.current().player.clock;
  readonly #lines: () => readonly LyricsTimedLine[] | null;
  #index = $state.raw(-1);

  public constructor(lines: () => readonly LyricsTimedLine[] | null) {
    this.#lines = lines;
    // Start from where the clock is now, so a panel opened mid-song does not begin at line 0.
    this.#index = untrack(() => {
      const current = this.#lines();
      return current === null || current.length === 0
        ? -1
        : LyricsLines.findCurrentLineIndex(current, this.#clock.estimate());
    });

    // The clock's boundary is an external source with a callback that writes `#index`, so it is an
    // effect rather than a derived value.
    $effect(() => {
      const current = this.#lines();
      if (current === null || current.length === 0) {
        this.#index = -1;
        return;
      }
      return this.#clock.onBoundary(
        (positionMs) =>
          current[LyricsLines.findCurrentLineIndex(current, positionMs) + 1]?.startMs ?? null,
        (positionMs) => (this.#index = LyricsLines.findCurrentLineIndex(current, positionMs)),
      );
    });
  }

  public get index(): number {
    return this.#index;
  }

  /** Ms until the next line starts; null when there is none or the clock is not playing. */
  public msToNextLine(): number | null {
    const current = this.#lines();
    if (current === null || !this.#clock.playing()) return null;
    const next = current[this.#index + 1];
    return next === undefined ? null : Math.max(0, next.startMs - this.#clock.estimate());
  }
}
