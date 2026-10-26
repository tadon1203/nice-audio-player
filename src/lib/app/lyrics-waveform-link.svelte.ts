export interface LyricsSpan {
  startMs: number;
  endMs: number;
}

/**
 * Shared state between the dock's waveform and Now Playing's lyrics panel. Each field is its own
 * signal: the pointer moves often, and a reader that only wants `activeSpan` must not rerun
 * with it.
 */
export class LyricsWaveformLink {
  /** The current lyric line's span, lit on the dock waveform. */
  public activeSpan = $state.raw<LyricsSpan | null>(null);
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  public hoveredLineSpan = $state.raw<LyricsSpan | null>(null);
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  public hoveredWaveformMs = $state.raw<number | null>(null);

  public setActiveSpan(span: LyricsSpan | null): void {
    this.activeSpan = span;
  }

  public setHoveredLineSpan(span: LyricsSpan | null): void {
    this.hoveredLineSpan = span;
  }

  public setHoveredWaveformMs(ms: number | null): void {
    this.hoveredWaveformMs = ms;
  }
}
