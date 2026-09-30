export type LyricsSpan = { startMs: number; endMs: number };

/**
 * Shared state between the dock's waveform and Now Playing's lyrics panel. Each field is its own
 * signal: the pointer moves often, and a reader that only wants `activeSpan` must not rerun
 * with it.
 */
class LyricsWaveformLink {
  /** The current lyric line's span, lit on the dock waveform. */
  activeSpan = $state.raw<LyricsSpan | null>(null);
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  hoveredLineSpan = $state.raw<LyricsSpan | null>(null);
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  hoveredWaveformMs = $state.raw<number | null>(null);

  setActiveSpan(span: LyricsSpan | null): void {
    this.activeSpan = span;
  }

  setHoveredLineSpan(span: LyricsSpan | null): void {
    this.hoveredLineSpan = span;
  }

  setHoveredWaveformMs(ms: number | null): void {
    this.hoveredWaveformMs = ms;
  }
}

export const lyricsWaveformLink = new LyricsWaveformLink();
