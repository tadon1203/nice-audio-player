import { memo, useCallback, useEffect, useMemo } from "react";
import { ArrowDown, ArrowUp, Play } from "lucide-react";
import { m, useTransform, type MotionValue } from "motion/react";
import { useTrackLyrics } from "@/entities/lyrics";
import type { LyricsTimedLine } from "@/shared/ipc";
import { formatDuration } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/shadcn/button";
import { useMotionTransition } from "@/shared/ui/motion";
import { lyricsWaveformLink, useLyricsWaveformLink } from "@/features/lyrics-waveform-link";
import { usePlaybackActions, usePlaybackClock, usePlaybackDuration } from "@/entities/playback";
import { opacityAtDistance } from "../model/distance-opacity";
import { useAnchorPadding } from "../model/use-anchor-padding";
import { findCurrentLineIndex, lineSpan, useLyricsSync, withIntro } from "../model/use-lyrics-sync";
import { useLyricsScroll } from "../model/use-lyrics-scroll";
import { ReadingBand } from "./reading-band";

type LyricsPanelProps = {
  trackId: string | null;
  className?: string;
};

/**
 * Local LRC lyrics: synced (Gutter, auto-scroll, waveform link) or plain (static). Now Playing
 * shows it only once the lyrics are resolved; why there are none is said in its Facts line. The
 * current line sits 40% from the top, on the reading band, and a long intro shows as a gap bar.
 * It re-renders only when the current line changes: only the gap bar of an instrumental line
 * follows the playback clock, through styles.
 */
export function LyricsPanel({ trackId, className }: LyricsPanelProps) {
  const durationMs = usePlaybackDuration();
  const position = usePlaybackClock();
  const { seek } = usePlaybackActions();
  const onSeek = useCallback((value: number) => void seek(value), [seek]);
  const { data: resolution } = useTrackLyrics(trackId);
  const rawLines =
    resolution?.status === "resolved" && resolution.document.content.kind === "timed"
      ? resolution.document.content.lines
      : null;
  const timedLines = useMemo(() => (rawLines === null ? null : withIntro(rawLines)), [rawLines]);
  const currentIndex = useLyricsSync(timedLines);
  const scroll = useLyricsScroll(currentIndex);
  const anchor = useAnchorPadding();
  const scrollContainerRef = scroll.containerRef;
  const measureContainer = anchor.ref;
  const setContainer = useCallback(
    (element: HTMLDivElement | null) => {
      scrollContainerRef.current = element;
      return measureContainer(element);
    },
    [scrollContainerRef, measureContainer],
  );
  const { realign } = scroll;
  const anchorHeight = anchor.height;
  useEffect(() => realign(), [realign, anchorHeight]);
  const hoveredIndex = useLyricsWaveformLink((state) =>
    state.hoveredWaveformMs === null || timedLines === null
      ? -1
      : findCurrentLineIndex(timedLines, state.hoveredWaveformMs),
  );

  useEffect(() => {
    lyricsWaveformLink.setActiveSpan(
      timedLines !== null && currentIndex >= 0
        ? lineSpan(timedLines, currentIndex, durationMs)
        : null,
    );
    return () => lyricsWaveformLink.setActiveSpan(null);
  }, [timedLines, currentIndex, durationMs]);

  if (resolution?.status !== "resolved") return null;

  if (resolution.document.content.kind === "plain") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {resolution.document.content.lines.map((line, index) => (
            <p key={index} className={cn(LYRICS_TEXT, "text-foreground")}>
              {line.length > 0 ? line : " "}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const lines = timedLines ?? [];
  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <ReadingBand />
      <div
        ref={setContainer}
        data-mode={scroll.mode}
        role="log"
        aria-label="Lyrics"
        tabIndex={0}
        style={anchor.style}
        className="relative min-h-0 flex-1 overflow-y-auto mask-[linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)] outline-none [scrollbar-width:none] forced-colors:mask-none [&::-webkit-scrollbar]:hidden"
        {...scroll.containerHandlers}
      >
        <div
          aria-hidden="true"
          className="transition-none"
          style={{ height: "var(--anchor-top)" }}
        />
        {lines.map((_line, index) => (
          <LyricsLine
            key={index}
            lines={lines}
            index={index}
            durationMs={durationMs}
            isCurrent={index === currentIndex}
            isPast={index < currentIndex}
            isHovered={index === hoveredIndex}
            distance={Math.min(Math.abs(index - Math.max(currentIndex, 0)), 4)}
            position={position}
            registerLine={scroll.registerLine}
            onSeek={onSeek}
          />
        ))}
        <div
          aria-hidden="true"
          className="transition-none"
          style={{ height: "var(--anchor-bottom)" }}
        />
      </div>
      {scroll.mode === "free" && scroll.offscreen !== null ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          // Aligned with the lyric text: after the Gutter (w-16) and its gap (gap-4).
          className={cn("absolute left-20", scroll.offscreen === "above" ? "top-2" : "bottom-2")}
          onClick={scroll.jumpToCurrent}
        >
          {scroll.offscreen === "above" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
          Jump to current line
        </Button>
      ) : null}
    </div>
  );
}

type LyricsLineProps = {
  lines: readonly LyricsTimedLine[];
  index: number;
  durationMs: number | null;
  isCurrent: boolean;
  isPast: boolean;
  isHovered: boolean;
  /** Lines away from the current one, capped: how much dimmer the line is. */
  distance: number;
  position: MotionValue<number>;
  registerLine: (index: number, element: HTMLElement | null) => void;
  onSeek: (positionMs: number) => void;
};

/** The Gutter shows the time on hover, on focus and while free-scrolling. */
const SHOW_TIME =
  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-[mode=free]:opacity-100";
const HIDE_ON_TIME =
  "group-focus-within:opacity-0 group-hover:opacity-0 group-data-[mode=free]:opacity-0";

/** One lyric line. Memoised: the panel re-renders with the position, a line only when its own state changes. */
const LyricsLine = memo(function LyricsLine({
  lines,
  index,
  durationMs,
  isCurrent,
  isPast,
  isHovered,
  distance,
  position,
  registerLine,
  onSeek,
}: LyricsLineProps) {
  const lineTransition = useMotionTransition("smallMove");
  const line = lines[index]!;
  const isInterval = line.text.trim() === "";
  const ref = useCallback(
    (element: HTMLElement | null) => registerLine(index, element),
    [registerLine, index],
  );
  return (
    <m.div
      ref={ref}
      aria-current={isCurrent ? "true" : undefined}
      animate={{ opacity: opacityAtDistance(distance) }}
      transition={lineTransition}
      className={cn("group flex items-baseline gap-4 rounded-sm py-2", isHovered && "bg-accent/60")}
    >
      <button
        type="button"
        data-slot="lyrics-gutter"
        aria-label={`Seek to ${formatDuration(line.startMs)}`}
        onClick={() => onSeek(line.startMs)}
        onPointerEnter={() =>
          lyricsWaveformLink.setHoveredLineSpan(lineSpan(lines, index, durationMs))
        }
        onPointerLeave={() => lyricsWaveformLink.setHoveredLineSpan(null)}
        className="relative w-16 shrink-0 cursor-pointer text-right text-sm tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={SHOW_TIME}>{formatDuration(line.startMs)}</span>
        {/* The present is marked with ▶ in the artwork's colour until the time takes its place. */}
        {isCurrent ? (
          <Play
            aria-hidden
            className={cn(
              "absolute top-1/2 right-0 size-3.5 -translate-y-1/2 fill-(--artwork-accent) text-(--artwork-accent)",
              HIDE_ON_TIME,
            )}
          />
        ) : null}
      </button>
      {isInterval ? (
        <IntervalLine
          startMs={line.startMs}
          endMs={lineSpan(lines, index, durationMs)?.endMs ?? null}
          isCurrent={isCurrent}
          position={position}
        />
      ) : (
        <span className={cn("relative", LYRICS_TEXT)}>
          {/* Past is faintest, the present brightest, the future between; the current line is lit in the artwork's colour. */}
          <m.span
            animate={{
              color: isCurrent
                ? "var(--artwork-accent)"
                : isPast
                  ? "var(--faint-foreground)"
                  : "var(--muted-foreground)",
            }}
            transition={lineTransition}
          >
            {line.text}
          </m.span>
        </span>
      )}
    </m.div>
  );
});

/** The lyric type, sized by the width of the lyrics column (`cqi`), so the text fills it. */
const LYRICS_TEXT = "text-[clamp(1.5rem,5.5cqi,3rem)] leading-snug text-pretty";

/**
 * An instrumental gap: a thin bar that fills over the gap's real span while it is the current
 * line, so the wait shows how far it has got instead of an empty row.
 */
export function IntervalLine({
  startMs,
  endMs,
  isCurrent,
  position,
}: {
  startMs: number;
  endMs: number | null;
  isCurrent: boolean;
  position: MotionValue<number>;
}) {
  const scaleX = useTransform(() =>
    isCurrent && endMs !== null && endMs > startMs
      ? Math.min(1, Math.max(0, (position.get() - startMs) / (endMs - startMs)))
      : 0,
  );
  const label =
    endMs !== null ? `Instrumental, ${formatDuration(endMs - startMs)}` : "Instrumental";
  return (
    <span
      role="img"
      aria-label={label}
      data-slot="lyrics-interval"
      className="my-3 block h-0.5 w-24 overflow-hidden rounded-full bg-faint-foreground/40"
    >
      <m.span className="block size-full origin-left bg-(--artwork-accent)" style={{ scaleX }} />
    </span>
  );
}
