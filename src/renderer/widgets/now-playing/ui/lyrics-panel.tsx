import { useEffect } from "react";
import { m } from "motion/react";
import { useTrackLyrics } from "@/renderer/entities/lyrics";
import { formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { useLyricsWaveformLink } from "@/renderer/features/lyrics-waveform-link";
import {
  usePlaybackActions,
  usePlaybackPosition,
  usePlaybackTransport,
} from "@/renderer/features/playback-control";
import { findCurrentLineIndex, lineSpan, useLyricsSync } from "../model/use-lyrics-sync";
import { useLyricsScroll } from "../model/use-lyrics-scroll";

type LyricsPanelProps = {
  trackId: string | null;
  className?: string;
};

/**
 * Local LRC lyrics: synced (Gutter, auto-scroll, waveform link) or plain (static, `Unsynced`).
 * It reads the playback position itself, so the panels around it do not re-render with time.
 */
export function LyricsPanel({ trackId, className }: LyricsPanelProps) {
  const { positionMs, durationMs } = usePlaybackPosition();
  const isPlaying = usePlaybackTransport().status === "playing";
  const { seek } = usePlaybackActions();
  const onSeek = (value: number) => void seek(value);
  const { data: resolution } = useTrackLyrics(trackId);
  const timedLines =
    resolution?.status === "resolved" && resolution.document.content.kind === "timed"
      ? resolution.document.content.lines
      : null;
  const currentIndex = useLyricsSync(timedLines, positionMs, isPlaying);
  const scroll = useLyricsScroll(currentIndex);
  const link = useLyricsWaveformLink();
  const { setActiveSpan } = link;
  const lineTransition = useMotionTransition("smallMove");

  useEffect(() => {
    setActiveSpan(
      timedLines !== null && currentIndex >= 0
        ? lineSpan(timedLines, currentIndex, durationMs)
        : null,
    );
    return () => setActiveSpan(null);
  }, [timedLines, currentIndex, durationMs, setActiveSpan]);

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
  const hoveredIndex =
    link.hoveredWaveformMs === null ? -1 : findCurrentLineIndex(lines, link.hoveredWaveformMs);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <PanelHeader notice={notice} unsynced={false} />
      <div
        ref={scroll.containerRef}
        role="log"
        aria-label="Lyrics"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto outline-none"
        {...scroll.containerHandlers}
      >
        {lines.map((line, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;
          return (
            <div
              key={index}
              ref={scroll.registerLine(index)}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "flex items-baseline gap-4 rounded-sm py-1",
                index === hoveredIndex && "bg-accent/60",
              )}
            >
              <button
                type="button"
                data-slot="lyrics-gutter"
                aria-label={`Seek to ${formatDuration(line.startMs)}`}
                onClick={() => {
                  onSeek(line.startMs);
                  scroll.resetToFollow();
                }}
                onPointerEnter={() => link.setHoveredLineSpan(lineSpan(lines, index, durationMs))}
                onPointerLeave={() => link.setHoveredLineSpan(null)}
                className="w-16 shrink-0 cursor-pointer text-right text-sm tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {formatDuration(line.startMs)}
              </button>
              <m.span
                animate={{
                  color: isCurrent
                    ? "var(--foreground)"
                    : isPast
                      ? "var(--faint-foreground)"
                      : "var(--muted-foreground)",
                }}
                transition={lineTransition}
                className="text-2xl leading-relaxed"
              >
                {line.text.length > 0 ? line.text : " "}
              </m.span>
            </div>
          );
        })}
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
