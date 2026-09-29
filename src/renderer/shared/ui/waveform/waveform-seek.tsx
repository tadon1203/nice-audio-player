import { useEffect, useMemo, useRef, useState } from "react";
import { m, useTransform } from "motion/react";
import { cn } from "@/renderer/shared/lib/utils";
import { formatDuration } from "@/renderer/shared/lib/format";
import { useInterpolatedPosition } from "@/renderer/shared/ui/motion";
import { RollingNumber } from "@/renderer/shared/ui/rolling-number";
import { WaveformBars } from "./waveform-bars";
import { usePointerSeek } from "./use-pointer-seek";
import { barCountForWidth, resampleBars } from "./waveform-model";

type WaveformSeekProps = {
  /** Bar height in px. The dock uses a slim meter; Now Playing grows the same object larger. */
  height: number;
  /** RMS buckets 0-255, or null while the backend analyzes the file. */
  rms: readonly number[] | null;
  /** The playhead tick and hover guideline. Off for the dock's plain bar, where the fill edge
   * already marks the position and a second line would be redundant. */
  showPlayhead?: boolean;
  valueMs: number;
  durationMs: number | null;
  /** Whether the position is advancing; the fill and playhead run on the clock while it is. */
  playing: boolean;
  disabled: boolean;
  onInput: (positionMs: number) => void;
  onCommit: (positionMs: number) => void;
  /** The current lyric line's span, lit over the waveform. */
  activeSpan?: { startMs: number; endMs: number } | null;
  /** The hovered lyric line's span, faintly marked over the waveform. */
  hoveredLineSpan?: { startMs: number; endMs: number } | null;
  /** Reports the hovered position so Now Playing can faintly mark the corresponding line. */
  onHoverPositionChange?: (positionMs: number | null) => void;
  /** Bars grow from left to right when the waveform arrives, instead of all at once. */
  sweepBars?: boolean;
  /** A plain progress line with no bars (the dock): centred in its box. */
  lineOnly?: boolean;
  /** Colour class for the played part; the unplayed part is always dimmed ink. */
  playedClassName?: string;
  className?: string;
};

/**
 * The seek bar, shared by the dock and Now Playing at different `height`s (the same object,
 * scaled by context). Bars grow upward from a baseline; played is Ink-1 and unplayed is dimmer.
 * Its size never changes for a given caller, so geometry stays stable while the waveform
 * loads. Before analysis finishes it is a 2px line, and the bars grow out of that same line.
 */
export function WaveformSeek({
  height,
  rms,
  showPlayhead = true,
  valueMs,
  durationMs,
  playing,
  disabled,
  onInput,
  onCommit,
  activeSpan = null,
  hoveredLineSpan = null,
  onHoverPositionChange,
  sweepBars = false,
  lineOnly = false,
  playedClassName = "text-foreground",
  className,
}: WaveformSeekProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [grown, setGrown] = useState(false);
  const duration = durationMs ?? 0;
  const seekable = !disabled && duration > 0;
  const pointer = usePointerSeek({
    ref,
    durationMs: duration,
    width,
    seekable,
    valueMs,
    onInput,
    onCommit,
    onHoverPositionChange,
  });

  // Fill and playhead follow a per-frame estimate of the position, bound to styles so the
  // component does not re-render every frame. While dragging they track the pointer 1:1.
  const position = useInterpolatedPosition({
    positionMs: valueMs,
    durationMs,
    playing,
    immediate: pointer.dragging,
  });
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const progress = useTransform(() =>
    durationRef.current > 0 ? Math.min(1, Math.max(0, position.get() / durationRef.current)) : 0,
  );
  const clipPath = useTransform(() => `inset(0 ${(1 - progress.get()) * 100}% 0 0)`);
  const playheadLeft = useTransform(() => `${progress.get() * 100}%`);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  // While dragging, the bars around the pointer widen (a magnifier for fine seeking).
  const fisheye =
    pointer.dragging && pointer.hoverX !== null && !lineOnly ? { x: pointer.hoverX, width } : null;

  const hasPeaks = rms !== null && rms.length > 0;
  // The bars mount flat on the baseline and grow one frame later, so the growth can transition.
  // A refined waveform for the same track swaps the bars in place without growing again; the
  // caller keys this component by track, so a new track starts flat.
  useEffect(() => {
    if (!hasPeaks) return;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [hasPeaks]);

  const bars = useMemo(
    () => (rms === null ? [] : resampleBars(rms, barCountForWidth(width))),
    [rms, width],
  );

  const spanStyle = (span: { startMs: number; endMs: number }) =>
    duration > 0
      ? {
          left: `${(Math.max(0, span.startMs) / duration) * 100}%`,
          width: `${(Math.min(duration, span.endMs - span.startMs) / duration) * 100}%`,
        }
      : undefined;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={seekable ? 0 : -1}
      aria-label="Playback position"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.min(valueMs, duration)}
      aria-valuetext={`${formatDuration(valueMs)} of ${formatDuration(durationMs)}`}
      aria-disabled={!seekable}
      data-region="seek"
      data-ready={hasPeaks ? "true" : "false"}
      className={cn(
        "relative touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        seekable ? "cursor-pointer" : "cursor-default opacity-60",
        className,
      )}
      style={{ height }}
      {...pointer.handlers}
    >
      <div aria-hidden="true" className="absolute inset-0 text-foreground/35">
        <WaveformBars
          bars={bars}
          height={height}
          grown={grown}
          sweep={sweepBars}
          centered={lineOnly}
          fisheye={fisheye}
        />
      </div>
      <m.div
        aria-hidden="true"
        className={cn("absolute inset-0", playedClassName)}
        style={{ clipPath }}
      >
        <WaveformBars
          bars={bars}
          height={height}
          grown={grown}
          sweep={sweepBars}
          centered={lineOnly}
          fisheye={fisheye}
        />
      </m.div>
      {activeSpan !== null ? (
        <div
          aria-hidden="true"
          data-slot="waveform-active-span"
          className="absolute inset-y-0 bg-foreground/15"
          style={spanStyle(activeSpan)}
        />
      ) : null}
      {hoveredLineSpan !== null ? (
        <div
          aria-hidden="true"
          data-slot="waveform-hovered-span"
          className="absolute inset-y-0 bg-foreground/10"
          style={spanStyle(hoveredLineSpan)}
        />
      ) : null}
      {showPlayhead && duration > 0 ? (
        <m.div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-foreground"
          style={{ left: playheadLeft }}
          data-slot="waveform-playhead"
        />
      ) : null}
      {seekable && pointer.hoverX !== null ? (
        <>
          {showPlayhead ? (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-foreground/50"
              style={{ left: pointer.hoverX }}
            />
          ) : null}
          <span
            aria-hidden="true"
            data-slot="waveform-hover-time"
            className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 rounded-sm bg-popover px-1.5 py-0.5 text-xs tabular-nums text-popover-foreground shadow-floating"
            style={{ left: Math.min(width - 20, Math.max(20, pointer.hoverX)) }}
          >
            {pointer.dragging ? (
              formatDuration(pointer.hoverMs)
            ) : (
              <RollingNumber value={formatDuration(pointer.hoverMs)} />
            )}
          </span>
        </>
      ) : null}
    </div>
  );
}
