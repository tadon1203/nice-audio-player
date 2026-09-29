import { useEffect, useRef, useState } from "react";
import { useLyricsWaveformLink } from "@/renderer/features/lyrics-waveform-link";
import {
  usePlaybackActions,
  usePlaybackItem,
  usePlaybackPosition,
  usePlaybackTransport,
  usePlaybackWaveform,
} from "@/renderer/entities/playback";
import { formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { RollingNumber, spinTurns } from "@/renderer/shared/ui/rolling-number";
import { isSeekJump } from "@/renderer/shared/ui/motion";
import { WaveformSeek } from "@/renderer/shared/ui/waveform";

/** The dock's slim progress line — no waveform data, just position. */
export const DOCK_SEEK_HEIGHT = 6;
/** Now Playing's hero band — the only place the waveform itself is drawn. */
export const NOW_PLAYING_WAVEFORM_HEIGHT = 96;

/**
 * How many extra turns the time digits make for this render: a position that jumped away from
 * where the clock would have put it (a seek) spins with the distance; ordinary ticks and
 * dragging do not.
 */
function useJumpSpin(valueMs: number, playing: boolean, dragging: boolean): number {
  const last = useRef({ valueMs, atMs: performance.now(), dragging });
  const now = performance.now();
  const expected = last.current.valueMs + (playing ? now - last.current.atMs : 0);
  const spin =
    !dragging && !last.current.dragging && isSeekJump(expected, valueMs)
      ? spinTurns(valueMs - expected)
      : 0;
  useEffect(() => {
    last.current = { valueMs, atMs: performance.now(), dragging };
  }, [valueMs, dragging]);
  return spin;
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
  const { active, seekPending, status } = usePlaybackTransport();
  const { positionMs, durationMs } = usePlaybackPosition();
  const { seek } = usePlaybackActions();
  const lyricsLink = useLyricsWaveformLink();
  const waveform = usePlaybackWaveform(showWaveform && active && item ? item.file.path : null);
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(true);
  const canSeek = active && durationMs !== null;
  const seekValue = seekPreviewMs ?? positionMs;
  const dragging = seekPreviewMs !== null;
  const spin = useJumpSpin(seekValue, status === "playing", dragging);
  // Dragging tracks the pointer 1:1; otherwise the digits roll, and a new track does not spin back.
  const rolling = (text: string) =>
    dragging ? text : <RollingNumber key={item?.file.path ?? "none"} value={text} spin={spin} />;

  const seekBar = (
    <WaveformSeek
      key={item?.file.path ?? "none"}
      height={height}
      rms={showWaveform ? (waveform?.rms ?? null) : null}
      showPlayhead={showWaveform}
      valueMs={seekValue}
      durationMs={durationMs}
      playing={status === "playing"}
      sweepBars={showWaveform}
      lineOnly={!showWaveform}
      playedClassName={showWaveform ? "text-(--artwork-accent)" : undefined}
      disabled={!canSeek || seekPending}
      onInput={setSeekPreviewMs}
      onCommit={(value) => {
        void seek(value).finally(() => setSeekPreviewMs(null));
      }}
      activeSpan={lyricsLink.activeSpan}
      hoveredLineSpan={lyricsLink.hoveredLineSpan}
      onHoverPositionChange={lyricsLink.setHoveredWaveformMs}
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
