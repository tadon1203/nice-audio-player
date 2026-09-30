import { memo, useCallback, useEffect } from "react";
import { AnimatePresence, m, useTransform, type MotionValue } from "motion/react";
import { useTrackLyrics } from "@/renderer/entities/lyrics";
import type { LyricsTimedLine } from "@/shared/ipc";
import { formatDuration } from "@/renderer/shared/lib/format";
import { graphemes } from "@/renderer/shared/lib/graphemes";
import { cn } from "@/renderer/shared/lib/utils";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { useMotionBudget, useMotionTransition } from "@/renderer/shared/ui/motion";
import {
  lyricsWaveformLink,
  useLyricsWaveformLink,
} from "@/renderer/features/lyrics-waveform-link";
import {
  usePlaybackActions,
  usePlaybackClock,
  usePlaybackDuration,
} from "@/renderer/entities/playback";
import {
  MAX_LIFT_CHARS,
  charLift,
  charOpacity,
  findCurrentLineIndex,
  lineFillMs,
  lineProgress,
  lineSpan,
  useLyricsSync,
} from "../model/use-lyrics-sync";
import { useLyricsScroll } from "../model/use-lyrics-scroll";

type LyricsPanelProps = {
  trackId: string | null;
  className?: string;
};

/**
 * Local LRC lyrics: synced (Gutter, auto-scroll, waveform link) or plain (static, `Unsynced`).
 * It re-renders only when the current line changes: the lit fill of each line follows the
 * playback clock through styles.
 */
export function LyricsPanel({ trackId, className }: LyricsPanelProps) {
  const durationMs = usePlaybackDuration();
  const position = usePlaybackClock();
  const { seek } = usePlaybackActions();
  const onSeek = useCallback((value: number) => void seek(value), [seek]);
  const { data: resolution } = useTrackLyrics(trackId);
  const timedLines =
    resolution?.status === "resolved" && resolution.document.content.kind === "timed"
      ? resolution.document.content.lines
      : null;
  const currentIndex = useLyricsSync(timedLines);
  const scroll = useLyricsScroll(currentIndex);
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

  if (resolution === undefined) return null;

  if (resolution.status === "notFound") {
    return (
      <LyricsMessage
        className={className}
        title="No lyrics for this track"
        detail="Add a .lrc file with the same name next to the audio file."
      />
    );
  }

  if (resolution.status === "sourceFailed") {
    return (
      <LyricsMessage className={className} title="Couldn't read the lyrics file" detail={null} />
    );
  }

  const notice =
    resolution.notice === "sidecarFailedUsingEmbedded"
      ? "The .lrc file couldn't be read. Showing embedded lyrics."
      : null;

  if (resolution.document.content.kind === "plain") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <PanelHeader notice={notice} unsynced />
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {resolution.document.content.lines.map((line, index) => (
            <p key={index} className="text-2xl leading-relaxed text-foreground">
              {line.length > 0 ? line : " "}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const lines = resolution.document.content.lines;
  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <PanelHeader notice={notice} unsynced={false} />
      <div
        ref={scroll.containerRef}
        role="log"
        aria-label="Lyrics"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto mask-[linear-gradient(to_bottom,transparent,black_12%,black_75%,transparent)] outline-none forced-colors:mask-none"
        {...scroll.containerHandlers}
      >
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
            onSeeked={scroll.resetToFollow}
          />
        ))}
      </div>
      {scroll.mode === "free" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute right-2 bottom-2"
          onClick={scroll.jumpToCurrent}
        >
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
  /** Lines away from the current one, capped: how much the line shrinks. */
  distance: number;
  position: MotionValue<number>;
  registerLine: (index: number, element: HTMLElement | null) => void;
  onSeek: (positionMs: number) => void;
  onSeeked: () => void;
};

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
  onSeeked,
}: LyricsLineProps) {
  const lineTransition = useMotionTransition("smallMove");
  const line = lines[index]!;
  const ref = useCallback(
    (element: HTMLElement | null) => registerLine(index, element),
    [registerLine, index],
  );
  return (
    <m.div
      ref={ref}
      aria-current={isCurrent ? "true" : undefined}
      // Lines shrink a little the further they are from the current one (a transform, so
      // nothing reflows).
      animate={{ scale: 1 - distance * 0.01 }}
      transition={lineTransition}
      style={{ transformOrigin: "left center" }}
      className={cn("flex items-baseline gap-4 rounded-sm py-1", isHovered && "bg-accent/60")}
    >
      <button
        type="button"
        data-slot="lyrics-gutter"
        aria-label={`Seek to ${formatDuration(line.startMs)}`}
        onClick={() => {
          onSeek(line.startMs);
          onSeeked();
        }}
        onPointerEnter={() =>
          lyricsWaveformLink.setHoveredLineSpan(lineSpan(lines, index, durationMs))
        }
        onPointerLeave={() => lyricsWaveformLink.setHoveredLineSpan(null)}
        className="w-16 shrink-0 cursor-pointer text-right text-sm tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {formatDuration(line.startMs)}
      </button>
      <span className="relative text-2xl leading-relaxed">
        {/* The current line starts unlit (Ink-2) and the fill below lights it. */}
        <m.span
          animate={{ color: isPast ? "var(--faint-foreground)" : "var(--muted-foreground)" }}
          transition={lineTransition}
        >
          {line.text.length > 0 ? line.text : " "}
        </m.span>
        <AnimatePresence>
          {isCurrent ? (
            <LineFill
              key="fill"
              text={line.text}
              startMs={line.startMs}
              fillMs={lineFillMs(
                (lineSpan(lines, index, durationMs)?.endMs ?? line.startMs) - line.startMs,
                line.text,
              )}
              position={position}
            />
          ) : null}
        </AnimatePresence>
      </span>
    </m.div>
  );
});

/**
 * The lit copy of the current line: the same text in the artwork's colour, one span per
 * character, lit in order as the line is sung. It sits exactly over the base text, so a wrapped
 * line fills its upper row before its lower one. Under calm or reduced motion the lift is skipped.
 */
function LineFill({
  text,
  startMs,
  fillMs,
  position,
}: {
  text: string;
  startMs: number;
  fillMs: number;
  position: MotionValue<number>;
}) {
  const chars = graphemes(text.length > 0 ? text : " ");
  const lift = useMotionBudget() === "full" && chars.length <= MAX_LIFT_CHARS;
  const progress = useTransform(() => lineProgress(position.get(), startMs, fillMs));
  return (
    <m.span
      aria-hidden="true"
      data-slot="lyrics-fill"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 text-(--artwork-accent)"
    >
      {chars.map((char, index) => (
        <FillChar
          key={index}
          char={char}
          index={index}
          count={chars.length}
          fillMs={fillMs}
          progress={progress}
          lift={lift}
        />
      ))}
    </m.span>
  );
}

function FillChar({
  char,
  index,
  count,
  fillMs,
  progress,
  lift,
}: {
  char: string;
  index: number;
  count: number;
  fillMs: number;
  progress: MotionValue<number>;
  lift: boolean;
}) {
  const opacity = useTransform(progress, (p) => charOpacity(p, index, count));
  // `top` on a relatively positioned inline span moves it without changing the line's wrapping.
  const top = useTransform(progress, (p) => (lift ? charLift(p, index, count, fillMs) : 0));
  return (
    <m.span className="relative" style={{ opacity, top }}>
      {char}
    </m.span>
  );
}

function PanelHeader({ notice, unsynced }: { notice: string | null; unsynced: boolean }) {
  if (!unsynced && notice === null) return null;
  return <p className="pb-2 text-sm text-muted-foreground">{unsynced ? "Unsynced" : notice}</p>;
}

function LyricsMessage({
  title,
  detail,
  className,
}: {
  title: string;
  detail: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col items-start justify-center gap-1", className)}>
      <p className="text-sm text-foreground">{title}</p>
      {detail !== null ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
