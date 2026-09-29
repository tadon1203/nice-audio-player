import { cn } from "@/renderer/shared/lib/utils";
import { fisheyeScale } from "./waveform-model";

/** Height of the flat line the bars grow out of, in px. */
export const WAVEFORM_BASELINE = 2;

/** Total time for the growth to sweep from the first bar to the last. */
const SWEEP_MS = 320;

type WaveformBarsProps = {
  /** Resampled bar peaks, 0-255. Empty while the backend analyzes the file. */
  bars: readonly number[];
  height: number;
  /** False draws every bar flat on the baseline; flipping it to true grows them. */
  grown: boolean;
  /** Grow left to right instead of all at once. */
  sweep: boolean;
  /** Draw the baseline on the box's centre line instead of its bottom edge, for a bar that
   * never grows bars, so text beside it can share that centre line. */
  centered?: boolean;
  /** While dragging: the pointer's x in px and the bar's width in px, to magnify the bars around it. */
  fisheye?: { x: number; width: number } | null;
};

/**
 * The drawing only: a baseline, and bars growing upward from it. Colour comes from the caller
 * (`currentColor`), so one instance serves the played and the unplayed layer.
 */
export function WaveformBars({
  bars,
  height,
  grown,
  sweep,
  centered = false,
  fisheye = null,
}: WaveformBarsProps) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-x-0 bg-current",
          centered ? "top-1/2 -translate-y-1/2" : "bottom-0",
        )}
        style={{ height: WAVEFORM_BASELINE }}
        data-slot="waveform-baseline"
      />
      {bars.length > 0 ? (
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${bars.length} ${height}`}
          preserveAspectRatio="none"
          data-slot="waveform-bars"
        >
          <g fill="currentColor">
            {bars.map((peak, index) => {
              // Only bars near the pointer get a scale, so hundreds of bars are not restyled.
              const scaleX =
                fisheye === null
                  ? 1
                  : fisheyeScale(((index + 0.5) / bars.length) * fisheye.width - fisheye.x);
              const barHeight = Math.max(WAVEFORM_BASELINE, (peak / 255) * (height - 2));
              return (
                <rect
                  key={index}
                  className={cn("transition-transform duration-300 ease-out")}
                  x={index + 0.15}
                  y={height - barHeight}
                  width={0.7}
                  height={barHeight}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "50% 100%",
                    transform: `scaleY(${grown ? 1 : WAVEFORM_BASELINE / barHeight})${scaleX === 1 ? "" : ` scaleX(${scaleX})`}`,
                    // The magnifier follows the pointer 1:1, without the growth easing.
                    transition: fisheye === null ? undefined : "none",
                    transitionDelay: sweep ? `${(index / bars.length) * SWEEP_MS}ms` : undefined,
                  }}
                />
              );
            })}
          </g>
        </svg>
      ) : null}
    </>
  );
}
