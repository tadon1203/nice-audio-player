import { create } from "zustand";

export type LyricsSpan = { startMs: number; endMs: number };

type LyricsWaveformLinkState = {
  /** The current lyric line's span, lit on the dock waveform. */
  activeSpan: LyricsSpan | null;
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  hoveredLineSpan: LyricsSpan | null;
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  hoveredWaveformMs: number | null;
};

/**
 * Shared state between the dock's waveform (`widgets/playback-region`) and Now Playing's
 * lyrics panel (`widgets/now-playing`), sibling widgets, so it lives one layer down. Read it
 * with selectors: the pointer moves often, and a reader that only wants `activeSpan` must not
 * re-render with it.
 */
export const useLyricsWaveformLink = create<LyricsWaveformLinkState>(() => ({
  activeSpan: null,
  hoveredLineSpan: null,
  hoveredWaveformMs: null,
}));

export const lyricsWaveformLink = {
  setActiveSpan: (activeSpan: LyricsSpan | null) => useLyricsWaveformLink.setState({ activeSpan }),
  setHoveredLineSpan: (hoveredLineSpan: LyricsSpan | null) =>
    useLyricsWaveformLink.setState({ hoveredLineSpan }),
  setHoveredWaveformMs: (hoveredWaveformMs: number | null) =>
    useLyricsWaveformLink.setState({ hoveredWaveformMs }),
};
