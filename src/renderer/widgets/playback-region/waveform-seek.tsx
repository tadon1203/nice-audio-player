import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { m } from "motion/react";
import { cn } from "@/renderer/shared/lib/utils";
import { formatDuration } from "@/renderer/shared/lib/format";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import {
  barCountForWidth,
  nextSeekPosition,
  positionFromOffset,
  resampleBars,
} from "./model/waveform-model";

const BASELINE = 2;

type WaveformSeekProps = {
  /** Bar height in px. The dock uses a slim meter; Now Playing grows the same object larger. */
  height: number;
  /** Peak buckets 0-255, or null while the backend analyzes the file. */
  peaks: readonly number[] | null;
  /** The playhead tick and hover guideline. Off for the dock's plain bar, where the fill edge
   * already marks the position and a second line would be redundant. */
  showPlayhead?: boolean;
  valueMs: number;
  durationMs: number | null;
  disabled: boolean;
  onInput: (positionMs: number) => void;
  onCommit: (positionMs: number) => void;
  /** The current lyric line's span, lit over the waveform. */
  activeSpan?: { startMs: number; endMs: number } | null;
  /** The hovered lyric line's span, faintly marked over the waveform. */
  hoveredLineSpan?: { startMs: number; endMs: number } | null;
  /** Reports the hovered position so Now Playing can faintly mark the corresponding line. */
  onHoverPositionChange?: (positionMs: number | null) => void;
  className?: string;
};

/**
 * The seek bar, shared by the dock and Now Playing at different `height`s (the same object,
 * scaled by context — see `PlaybackWaveformBand`). Bars grow upward from a baseline; played is
 * Ink-1 and unplayed Ink-2. Its size never changes for a given caller, so geometry stays stable
 * while the waveform loads. Before analysis finishes it is a 2px line, and the bars grow out of
 * that same line.
 */
export function WaveformSeek({
  height,
  peaks,
  showPlayhead = true,
  valueMs,
  durationMs,
  disabled,
  onInput,
  onCommit,
  activeSpan = null,
  hoveredLineSpan = null,
  onHoverPositionChange,
  className,
}: WaveformSeekProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [grown, setGrown] = useState(false);
  const duration = durationMs ?? 0;
  const seekable = !disabled && duration > 0;
  // While dragging, the clip-path must track the pointer 1:1 (no easing). Elsewhere — normal
  // playback ticking every 250ms, or a click seek's jump — it eases with the same spring as
  // everything else in the app, instead of the flat, mechanical snap a plain CSS transition gives.
  const progressTransition = useMotionTransition("smallMove");
  const clipTransition = dragging ? { duration: 0 } : progressTransition;

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

  const hasPeaks = peaks !== null && peaks.length > 0;
  // The bars mount flat on the baseline and grow one frame later, so the growth can transition.
  // A refined waveform for the same track swaps the bars in place without growing again; the
  // caller keys this component by track, so a new track starts flat.
  useEffect(() => {
    if (!hasPeaks) return;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [hasPeaks]);

  const bars = useMemo(
    () => (peaks === null ? [] : resampleBars(peaks, barCountForWidth(width))),
    [peaks, width],
  );

  const progress = duration > 0 ? Math.min(1, Math.max(0, valueMs / duration)) : 0;
  // Measured live, not from the `width` state: that state only drives bar resampling and can
  // lag a frame behind the element's actual box (e.g. while a shared-element layout animation
  // is still settling), which would otherwise throw pointer math off by that same lag.
  const liveWidth = () => ref.current?.getBoundingClientRect().width ?? width;
  const offsetOf = (event: PointerEvent<HTMLDivElement>) =>
    event.clientX - (ref.current?.getBoundingClientRect().left ?? 0);
  const positionOf = (event: PointerEvent<HTMLDivElement>) =>
    positionFromOffset(offsetOf(event), liveWidth(), duration);
  const hoverMs = hoverX === null ? null : positionFromOffset(hoverX, liveWidth(), duration);
  const spanStyle = (span: { startMs: number; endMs: number }) =>
    duration > 0
      ? {
          left: `${(Math.max(0, span.startMs) / duration) * 100}%`,
          width: `${(Math.min(duration, span.endMs - span.startMs) / duration) * 100}%`,
        }
      : undefined;

  const layer = (played: boolean) => {
    const clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
    return (
      <m.div
        aria-hidden="true"
        className={cn("absolute inset-0", played ? "text-foreground" : "text-muted-foreground")}
        animate={played ? { clipPath } : undefined}
        transition={played ? clipTransition : undefined}
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-current"
          style={{ height: BASELINE }}
          data-slot="waveform-baseline"
        />
        {bars.length > 0 ? (
          <svg
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${bars.length} ${height}`}
            preserveAspectRatio="none"
            data-slot="waveform-bars"
          >
            <g
              fill="currentColor"
              className="transition-transform duration-300 ease-out motion-reduce:duration-100"
              style={{
                transformOrigin: `0 ${height}px`,
                transform: `scaleY(${grown ? 1 : BASELINE / height})`,
              }}
            >
              {bars.map((peak, index) => {
                const barHeight = Math.max(BASELINE, (peak / 255) * (height - 2));
                return (
                  <rect
                    key={index}
                    x={index + 0.15}
                    y={height - barHeight}
                    width={0.7}
                    height={barHeight}
                  />
                );
              })}
            </g>
          </svg>
        ) : null}
      </m.div>
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!seekable) return;
    const next = nextSeekPosition(event.key, valueMs, duration);
    if (next === null) return;
    event.preventDefault();
    onInput(next);
    onCommit(next);
  };

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
      onPointerDown={(event) => {
        if (!seekable || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onInput(positionOf(event));
      }}
      onPointerMove={(event) => {
        const currentWidth = liveWidth();
        const nextHoverX = Math.min(currentWidth, Math.max(0, offsetOf(event)));
        setHoverX(nextHoverX);
        onHoverPositionChange?.(positionFromOffset(nextHoverX, currentWidth, duration));
        if (dragging) onInput(positionOf(event));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        setDragging(false);
        onCommit(positionOf(event));
      }}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => {
        setHoverX(null);
        onHoverPositionChange?.(null);
      }}
      onKeyDown={onKeyDown}
    >
      {layer(false)}
      {layer(true)}
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
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${progress * 100}%` }}
          data-slot="waveform-playhead"
        />
      ) : null}
      {seekable && hoverX !== null ? (
        <>
          {showPlayhead ? (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-foreground/50"
              style={{ left: hoverX }}
            />
          ) : null}
          <span
            aria-hidden="true"
            data-slot="waveform-hover-time"
            className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 rounded-sm bg-popover px-1.5 py-0.5 text-xs tabular-nums text-popover-foreground shadow-floating"
            style={{ left: Math.min(width - 20, Math.max(20, hoverX)) }}
          >
            {formatDuration(hoverMs)}
          </span>
        </>
      ) : null}
    </div>
  );
}
