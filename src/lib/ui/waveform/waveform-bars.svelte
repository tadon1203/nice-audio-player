<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { levelToUnit } from "./waveform-model";

  /** Height of the flat line the bars grow out of, in px. */
  const BASELINE = 2;
  /** Total time for the growth to sweep from the first bar to the last. */
  const SWEEP_MS = 320;

  /**
   * The drawing only: a baseline, and bars growing upward from it, each an RMS level on a dB
   * scale. Colour comes from the caller (`currentColor`), so one instance serves the played and
   * the unplayed layer.
   */
  let {
    bars,
    height,
    grown,
    sweep,
    centered = false,
  }: {
    /** Resampled RMS levels, 0-255. Empty while the backend analyzes the file. */
    bars: readonly number[];
    height: number;
    /** False draws every bar flat on the baseline; flipping it to true grows them. */
    grown: boolean;
    /** Grow left to right instead of all at once. */
    sweep: boolean;
    /** Draw the baseline on the box's centre line instead of its bottom edge, for a bar that
     * never grows bars, so text beside it can share that centre line. */
    centered?: boolean;
  } = $props();
</script>

<div
  class={cn("absolute inset-x-0 bg-current", centered ? "top-1/2 -translate-y-1/2" : "bottom-0")}
  style:height="{BASELINE}px"
  data-slot="waveform-baseline"
></div>
{#if bars.length > 0}
  <svg
    class="absolute inset-0 size-full"
    viewBox="0 0 {bars.length} {height}"
    preserveAspectRatio="none"
    data-slot="waveform-bars"
  >
    <g fill="currentColor">
      {#each bars as level, index (index)}
        {@const barHeight = Math.max(BASELINE, levelToUnit(level) * (height - 2))}
        <rect
          class="transition-transform duration-300 ease-out"
          x={index + 0.15}
          y={height - barHeight}
          width={0.7}
          height={barHeight}
          style:transform-box="fill-box"
          style:transform-origin="50% 100%"
          style:transform="scaleY({grown ? 1 : BASELINE / barHeight})"
          style:transition-delay={sweep ? `${(index / bars.length) * SWEEP_MS}ms` : undefined}
        />
      {/each}
    </g>
  </svg>
{/if}
