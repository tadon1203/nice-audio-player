import { useEffect, useState } from "react";
import { m } from "motion/react";
import { usePlaybackItem } from "@/entities/playback";
import { useTrackLyrics } from "@/entities/lyrics";
import { PlaybackWaveformBand, useNowPlayingTransitions } from "@/features/now-playing-transition";
import type { PlaybackItem } from "@/shared/ipc";
import { cn } from "@/shared/lib/utils";
import { Identity } from "./identity";
import { LyricsPanel } from "./lyrics-panel";
import { NowPlayingLight } from "./now-playing-light";
import { QueueColumn } from "./queue-column";
import { UpNext } from "./up-next";

/**
 * One Sleeve size for every state. Container units resolve against the grid area (the layer
 * without the waveform band): its height minus the outer padding (4rem), the gap between the
 * Sleeve and the info (1rem) and the info block (~10rem), and never more than 38% of the width.
 */
const SLEEVE_SIZE = "max(10rem, min(calc(100cqh - 15rem), 38cqw, 40rem))";

/** The waveform band's height for the room the layer has: it gives way to the content. */
function waveformHeightFor(layerHeightPx: number): number {
  if (layerHeightPx >= 640) return 96;
  if (layerHeightPx >= 480) return 72;
  return 56;
}

function useLayerHeight() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(720);
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, height };
}

/**
 * Now Playing's content: one skeleton in every state. Left, the Sleeve and the track's info;
 * right, what this playback is doing now: its lyrics, or else the queue in the order it plays,
 * the current line or track always 40% from the top. Beside lyrics, from 90rem, a rail of the
 * upcoming tracks; below that the next track sits at the end of the waveform band instead (never
 * both, and never beside a queue that already shows it). The Sleeve continues its shared-element
 * motion from the dock (the same `layoutId`); the text is not shared, it fades in behind the
 * Sleeve. Below `md` everything stacks. The waveform grows along the bottom edge when its data
 * arrives.
 */
export function NowPlayingContent() {
  const item = usePlaybackItem();
  const { ref, height } = useLayerHeight();
  const { data: resolution } = useTrackLyrics(item?.trackId ?? null);
  // While lyrics are loading keep the column the previous track had, so it does not flip twice
  // (they are also fetched ahead of time). The first ever render starts from what is cached.
  const [showLyrics, setShowLyrics] = useState(resolution?.status === "resolved");
  if (resolution !== undefined && (resolution.status === "resolved") !== showLyrics) {
    setShowLyrics(resolution.status === "resolved");
  }

  return (
    <div ref={ref} className="@container/npw relative flex h-full min-h-0 min-w-0 flex-col">
      <NowPlayingLight />
      {/* The size container: the layer without the waveform band, and without padding. */}
      <div className="relative min-h-0 min-w-0 flex-1 [container-name:np] [container-type:size]">
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col md:grid md:grid-rows-[minmax(0,1fr)] md:gap-12 md:p-8",
            showLyrics
              ? "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)] @min-[90rem]/npw:grid-cols-[var(--np-sleeve)_minmax(0,1fr)_20rem]"
              : "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)]",
          )}
          style={{ "--np-sleeve": SLEEVE_SIZE } as React.CSSProperties}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-4 p-6 md:w-(--np-sleeve) md:p-0">
            <Identity item={item} resolution={resolution ?? null} />
          </div>
          <RightColumn item={item} showLyrics={showLyrics} />
          {showLyrics ? (
            <QueueColumn variant="rail" className="hidden @min-[90rem]/npw:flex" />
          ) : null}
        </div>
      </div>
      <PlaybackWaveformBand
        height={waveformHeightFor(height)}
        timeLayout="inline"
        className="relative shrink-0 border-t border-border/50 px-6 py-4"
        timeClassName="text-sm"
        trailing={showLyrics ? <UpNext className="@min-[90rem]/npw:hidden" /> : null}
      />
    </div>
  );
}

function RightColumn({ item, showLyrics }: { item: PlaybackItem | null; showLyrics: boolean }) {
  const transitions = useNowPlayingTransitions();
  return (
    <m.div
      key={`${showLyrics ? "lyrics" : "queue"}:${item?.trackId ?? "none"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: transitions.content }}
      // An inline-size container: the text is sized from this column's width (`cqi`).
      className="min-h-0 min-w-0 flex-1 p-6 pt-0 [container-type:inline-size] md:p-0"
    >
      {showLyrics ? (
        <LyricsPanel trackId={item?.trackId ?? null} className="h-full" />
      ) : (
        <QueueColumn variant="full" />
      )}
    </m.div>
  );
}
