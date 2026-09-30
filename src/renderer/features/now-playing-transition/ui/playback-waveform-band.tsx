import { useEffect, useRef, useState } from "react";
import {
  lyricsWaveformLink,
  useLyricsWaveformLink,
} from "@/renderer/features/lyrics-waveform-link";
import {
  usePlaybackActions,
  usePlaybackClock,
  usePlaybackItem,
  usePlaybackJump,
  usePlaybackPosition,
  usePlaybackTransport,
  usePlaybackWaveform,
} from "@/renderer/entities/playback";
import { formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { RollingNumber, spinTurns } from "@/renderer/shared/ui/rolling-number";
import { WaveformSeek } from "@/renderer/shared/ui/waveform";

/** The dock's slim progress line — no waveform data, just position. */
export const DOCK_SEEK_HEIGHT = 6;
/** Now Playing's hero band — the only place the waveform itself is drawn. */
export const NOW_PLAYING_WAVEFORM_HEIGHT = 96;

/**
 * How many extra turns the time digits make for this render: a seek that just completed spins
 * them with its distance. Ordinary ticks, a new track and dragging (the digits follow the
 * pointer) do not.
 */
function useJumpSpin(dragging: boolean): number {
  const jump = usePlaybackJump();
  // A jump is spun for once, in the render that first sees it (a seek that finished before
  // this mounted is not ours).
  const handled = useRef(jump?.id ?? 0);
  const fresh = jump !== null && jump.id !== handled.current;
  useEffect(() => {
    handled.current = jump?.id ?? 0;
  }, [jump]);
  return fresh && jump.kind === "seek" && !dragging ? spinTurns(jump.toMs - jump.fromMs) : 0;
}

/**
 * The seek bar and its elapsed/remaining labels, used by both the dock (a plain progress line,
 * `showWaveform={false}`) and Now Playing (the waveform hero, `showWaveform` defaulted true).
 * They are two separate bars, never morphed into each other: Now Playing's bars grow out of
 * its baseline once the waveform arrives. Only one is mounted at a time, since the dock hides
 * its band while Now Playing is open.
 *
 * `timeLayout="inline"` puts the labels beside the bar instead of on their own row below it,
 * so the whole band is only as tall as one line of text — the dock's shape; `"stacked"` (Now
 * Playing) keeps the labels on their own row under the full-height hero waveform.
 */
export function PlaybackWaveformBand({
  height,
  showWaveform = true,
  timeLayout = "stacked",
  className,
  seekClassName,
  timeClassName,
}: {
  height: number;
  showWaveform?: boolean;
  timeLayout?: "stacked" | "inline";
  className?: string;
  seekClassName?: string;
  timeClassName?: string;
}) {
  const item = usePlaybackItem();
  const { active, seekPending } = usePlaybackTransport();
  const { positionMs, durationMs } = usePlaybackPosition();
  const { seek } = usePlaybackActions();
  const clock = usePlaybackClock();
  const activeSpan = useLyricsWaveformLink((state) => state.activeSpan);
  const hoveredLineSpan = useLyricsWaveformLink((state) => state.hoveredLineSpan);
  const waveform = usePlaybackWaveform(showWaveform && active && item ? item.file.path : null);
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(true);
  const canSeek = active && durationMs !== null;
  const seekValue = seekPreviewMs ?? positionMs;
  const dragging = seekPreviewMs !== null;
  const spin = useJumpSpin(dragging);
  // Dragging tracks the pointer 1:1. Otherwise the digits roll only for a jump (a seek); the
  // ordinary tick of a second is a plain rewrite, so the time does not add a second thing that
  // moves all the time. A new track does not spin back.
  const rolling = (text: string) =>
    dragging ? (
      text
    ) : (
      <RollingNumber
        key={item?.file.path ?? "none"}
        value={text}
        spin={spin}
        instant={spin === 0}
      />
    );

  const seekBar = (
    <WaveformSeek
      key={item?.file.path ?? "none"}
      height={height}
      rms={showWaveform ? (waveform?.rms ?? null) : null}
      showPlayhead={showWaveform}
      valueMs={seekValue}
      durationMs={durationMs}
      position={clock}
      sweepBars={showWaveform}
      lineOnly={!showWaveform}
      playedClassName={showWaveform ? "text-(--artwork-accent)" : undefined}
      disabled={!canSeek || seekPending}
      onInput={setSeekPreviewMs}
      onCommit={(value) => {
        void seek(value).finally(() => setSeekPreviewMs(null));
      }}
      activeSpan={activeSpan}
      hoveredLineSpan={hoveredLineSpan}
      onHoverPositionChange={lyricsWaveformLink.setHoveredWaveformMs}
      className={cn(timeLayout === "inline" && "flex-1", seekClassName)}
    />
  );
  const remainingOrLength =
    durationMs === null
      ? formatDuration(null)
      : showRemaining
        ? `−${formatDuration(Math.max(0, durationMs - seekValue))}`
        : formatDuration(durationMs);
  const remainingButton = (
    <button
      type="button"
      aria-pressed={showRemaining}
      aria-label={showRemaining ? "Time remaining" : "Track length"}
      title={showRemaining ? "Show track length" : "Show time remaining"}
      className="shrink-0 cursor-pointer rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => setShowRemaining((current) => !current)}
    >
      {rolling(remainingOrLength)}
    </button>
  );

  if (timeLayout === "inline") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs leading-none text-muted-foreground tabular-nums",
          className,
        )}
      >
        <span className={cn("shrink-0", timeClassName)} aria-label="Elapsed time">
          {rolling(formatDuration(seekValue))}
        </span>
        {seekBar}
        <span className={cn("shrink-0", timeClassName)}>{remainingButton}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {seekBar}
      <div
        className={cn(
          "flex items-center justify-between text-xs text-muted-foreground tabular-nums",
          timeClassName,
        )}
        data-region="playback-times"
      >
        <span aria-label="Elapsed time">{rolling(formatDuration(seekValue))}</span>
        {remainingButton}
      </div>
    </div>
  );
}
