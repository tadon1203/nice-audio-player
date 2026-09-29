import { cn } from "@/renderer/shared/lib/utils";

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
};

/**
 * The drawing only: a baseline, and bars growing upward from it. Colour comes from the caller
 * (`currentColor`), so one instance serves the played and the unplayed layer.
 */
export function WaveformBars({ bars, height, grown, sweep }: WaveformBarsProps) {
  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 bg-current"
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
                    transform: `scaleY(${grown ? 1 : WAVEFORM_BASELINE / barHeight})`,
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
