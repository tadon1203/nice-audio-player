import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type LyricsSpan = { startMs: number; endMs: number };

type LyricsWaveformLinkValue = {
  /** The current lyric line's span, lit on the dock waveform. */
  activeSpan: LyricsSpan | null;
  setActiveSpan: (span: LyricsSpan | null) => void;
  /** The span of the lyric line under the pointer, faintly marked on the waveform. */
  hoveredLineSpan: LyricsSpan | null;
  setHoveredLineSpan: (span: LyricsSpan | null) => void;
  /** The position under the pointer while hovering the waveform, marking its lyric line. */
  hoveredWaveformMs: number | null;
  setHoveredWaveformMs: (positionMs: number | null) => void;
};

const LyricsWaveformLinkContext = createContext<LyricsWaveformLinkValue | null>(null);

/**
 * Shared state between the dock's waveform (`widgets/playback-region`) and Now Playing's
 * lyrics panel (`widgets/now-playing`) — sibling widgets, so this lives one layer down and is
 * mounted once, in the app shell.
 */
export function LyricsWaveformLinkProvider({ children }: { children: ReactNode }) {
  const [activeSpan, setActiveSpan] = useState<LyricsSpan | null>(null);
  const [hoveredLineSpan, setHoveredLineSpan] = useState<LyricsSpan | null>(null);
  const [hoveredWaveformMs, setHoveredWaveformMs] = useState<number | null>(null);

  const value = useMemo(
    () => ({
      activeSpan,
      setActiveSpan,
      hoveredLineSpan,
      setHoveredLineSpan,
      hoveredWaveformMs,
      setHoveredWaveformMs,
    }),
    [activeSpan, hoveredLineSpan, hoveredWaveformMs],
  );

  return (
    <LyricsWaveformLinkContext.Provider value={value}>
      {children}
    </LyricsWaveformLinkContext.Provider>
  );
}

export function useLyricsWaveformLink(): LyricsWaveformLinkValue {
  const value = useContext(LyricsWaveformLinkContext);
  if (value === null) {
    throw new Error("useLyricsWaveformLink must be used within a LyricsWaveformLinkProvider");
  }
  return value;
}
