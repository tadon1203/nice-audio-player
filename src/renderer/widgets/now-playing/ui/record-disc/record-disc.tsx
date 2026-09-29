import { useEffect, useMemo, useRef, useState } from "react";
import {
  animate,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useArtworkAccent } from "@/renderer/entities/library";
import {
  usePlaybackItem,
  usePlaybackPosition,
  usePlaybackSignalPath,
  usePlaybackTransport,
  usePlaybackWaveform,
} from "@/renderer/entities/playback";
import { useLyricsWaveformLink } from "@/renderer/features/lyrics-waveform-link";
import { formatDuration } from "@/renderer/shared/lib/format";
import { useArtworkBackdrop } from "@/renderer/shared/lib/artwork-backdrop";
import { cn } from "@/renderer/shared/lib/utils";
import { readableAccent } from "@/renderer/shared/ui/artwork-light";
import {
  estimatePosition,
  isSeekJump,
  motionTokens,
  useInterpolatedPosition,
} from "@/renderer/shared/ui/motion";
import { DiscLabel, ringText } from "./disc-label";
import { computeGroove, GROOVE_INNER, GROOVE_OUTER, paintGroove } from "./groove-canvas";
import { discAngle, grooveRadius, seekSpin } from "./groove-model";

const UNPLAYED = "rgba(250, 250, 250, 0.22)";
const LIT_LINE = "rgba(250, 250, 250, 0.55)";
const PLAYED_FALLBACK = "#fafafa";
/** The groove is carved from the outside in over this long, like the Now Playing waveform sweep. */
const CARVE_S = 0.32;

/** The disc's pixel width, kept current, so the canvases can be drawn sharp. */
function useElementSize(ref: React.RefObject<HTMLElement | null>): number {
  const [size, setSize] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setSize(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** A mask that shows only what is further out than `percent` of the radius. */
const outsideOf = (percent: number) =>
  `radial-gradient(circle closest-side, transparent ${percent - 0.4}%, #000 ${percent}%)`;

/**
 * A flat, front-on record drawn from the playing track's own waveform (see DESIGN.md, Now
 * Playing). The groove is a spiral of 30 turns, so the groove at the fixed needle (3 o'clock)
 * is what is sounding. The disc turns with the playback position, the played part of the groove
 * is drawn in the artwork colour, and the label carries the track's facts. Decorative and
 * `aria-hidden`; seeking stays with the waveform. `roll` adds the turning of its slide out
 * from behind the Sleeve, in degrees.
 */
export function RecordDisc({
  trackNumber,
  roll,
  className,
}: {
  trackNumber: number | null;
  roll?: MotionValue<number>;
  className?: string;
}) {
  const item = usePlaybackItem();
  const { positionMs, durationMs } = usePlaybackPosition();
  const playing = usePlaybackTransport().status === "playing";
  const waveform = usePlaybackWaveform(item?.file.path ?? null);
  const peaks = waveform?.peaks ?? null;
  const signalPath = usePlaybackSignalPath();
  const { activeSpan } = useLyricsWaveformLink();
  const reduced = useReducedMotion() === true;
  const backdrop = useArtworkBackdrop((state) => state.enabled);
  const artworkColor = useArtworkAccent(item?.artwork);
  const labelColor = backdrop ? artworkColor : null;
  const accent = (backdrop ? readableAccent(artworkColor) : null) ?? PLAYED_FALLBACK;

  const box = useRef<HTMLDivElement>(null);
  const size = useElementSize(box);
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const playedCanvas = useRef<HTMLCanvasElement>(null);

  const groove = useMemo(
    () => (peaks === null || size === 0 ? [] : computeGroove(peaks, size)),
    [peaks, size],
  );
  const litRuns = useMemo(() => {
    if (peaks === null || size === 0 || activeSpan === null || !durationMs) return [];
    return computeGroove(peaks, size, [
      activeSpan.startMs / durationMs,
      activeSpan.endMs / durationMs,
    ]);
  }, [peaks, size, activeSpan, durationMs]);

  useEffect(() => {
    if (baseCanvas.current === null || size === 0) return;
    paintGroove(baseCanvas.current, size, window.devicePixelRatio || 1, [
      { runs: groove, color: UNPLAYED },
      { runs: litRuns, color: LIT_LINE },
    ]);
  }, [groove, litRuns, size]);
  useEffect(() => {
    if (playedCanvas.current === null || size === 0) return;
    paintGroove(playedCanvas.current, size, window.devicePixelRatio || 1, [
      { runs: groove, color: accent },
    ]);
  }, [groove, accent, size]);

  // The groove is carved from the outside in whenever a waveform arrives.
  const carve = useMotionValue(0);
  useEffect(() => {
    if (peaks === null) return;
    if (reduced) {
      carve.set(1);
      return;
    }
    carve.set(0);
    const controls = animate(carve, 1, { duration: CARVE_S, ease: "easeOut" });
    return () => controls.stop();
  }, [peaks, reduced, carve]);
  const carveMask = useTransform(carve, (v) =>
    v >= 1 ? "none" : outsideOf(100 - v * (100 - GROOVE_INNER * 100)),
  );

  // `spring` eases the played fill and needle over a seek; `raw` drives the angle 1:1.
  const spring = useInterpolatedPosition({ positionMs, durationMs, playing });
  const raw = useInterpolatedPosition({ positionMs, durationMs, playing, immediate: true });
  const share = (p: number) => (durationMs ? Math.min(1, Math.max(0, p / durationMs)) : 0);
  const radiusPercent = useTransform(
    spring,
    (p) => grooveRadius(share(p), GROOVE_OUTER, GROOVE_INNER) * 100,
  );
  const playedMask = useTransform(radiusPercent, (r) => outsideOf(r));
  const needleX = useTransform(radiusPercent, (r) => 50 + r / 2);

  // A seek spins the disc one turn plus the remainder instead of dozens of turns: the offset
  // starts by cancelling the jump, then settles on the whole turn that ends on the target.
  const spin = useMotionValue(0);
  const last = useRef({ positionMs, atMs: performance.now(), key: item?.queueItemId });
  useEffect(() => {
    const previous = last.current;
    const key = item?.queueItemId;
    last.current = { positionMs, atMs: performance.now(), key };
    if (reduced || durationMs === null || key !== previous.key) return;
    const expected = estimatePosition(previous, performance.now(), playing, durationMs);
    if (!isSeekJump(expected, positionMs)) return;
    const from = discAngle(share(expected));
    const to = discAngle(share(positionMs));
    const visual = seekSpin(from, to, positionMs >= expected ? 1 : -1);
    spin.jump(from - to);
    animate(spin, from + visual - to, motionTokens.spin);
  }, [positionMs]);
  const rotate = useTransform(() =>
    reduced ? 0 : discAngle(share(raw.get())) + spin.get() + (roll?.get() ?? 0),
  );

  const ring = ringText([
    item?.title,
    item?.artist,
    signalPath?.source,
    formatDuration(durationMs),
  ]);

  return (
    <div
      ref={box}
      aria-hidden="true"
      data-slot="record-disc"
      className={cn(
        "pointer-events-none relative aspect-square rounded-full border border-foreground/12 forced-colors:hidden",
        className,
      )}
      style={{ backgroundColor: "oklch(0.12 0 0)" }}
    >
      <m.div className="absolute inset-0" style={{ rotate }}>
        <m.div
          className="absolute inset-0"
          style={{ maskImage: carveMask, WebkitMaskImage: carveMask }}
        >
          <canvas ref={baseCanvas} className="absolute inset-0 size-full" />
          <m.canvas
            ref={playedCanvas}
            className="absolute inset-0 size-full"
            style={{ maskImage: playedMask, WebkitMaskImage: playedMask }}
          />
        </m.div>
        <DiscLabel color={labelColor} ring={ring} trackNumber={trackNumber} />
      </m.div>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <line
          x1={50 + GROOVE_INNER * 50}
          x2={50 + GROOVE_OUTER * 50}
          y1="50"
          y2="50"
          strokeWidth="0.28"
          className="stroke-foreground/40"
        />
        <m.circle cx={needleX} cy="50" r="0.6" className="fill-foreground" />
      </svg>
    </div>
  );
}
