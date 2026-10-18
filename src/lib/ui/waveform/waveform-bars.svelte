<script lang="ts">
  import { cn } from "#lib/utils/cn.js";
  import { BASELINE_PX, WaveformPainter } from "./waveform-painter";

  /**
   * The drawing only: a baseline, and bars growing upward from it, each an RMS level on a dB
   * scale. Colour comes from the caller (`currentColor`), so one instance serves the played and
   * the unplayed layer. The painting is `WaveformPainter`'s.
   */
  let {
    bars,
    height,
    sweep,
    centered = false,
    still = false,
  }: {
    /** Resampled RMS levels, 0-255. Empty while the backend analyzes the file. */
    bars: readonly number[];
    height: number;
    /** Grow left to right instead of all at once. */
    sweep: boolean;
    /** Draw the baseline on the box's centre line instead of its bottom edge, for a bar that
     * never grows bars, so text beside it can share that centre line. */
    centered?: boolean;
    /** The bars appear without growing: the caller's motion budget does not allow it. */
    still?: boolean;
  } = $props();

  const painter = new WaveformPainter();
  // Last resort: the props are the input, and the canvas may not exist yet (no bars), so the
  // painter is updated on every prop change rather than from an attachment on the canvas.
  $effect(() => painter.update({ bars, height, sweep, still }));
</script>

<div
  class={cn("absolute inset-x-0 bg-current", centered ? "top-1/2 -translate-y-1/2" : "bottom-0")}
  style:height="{BASELINE_PX}px"
  data-slot="waveform-baseline"
></div>
{#if bars.length > 0}
  <canvas class="absolute inset-0 size-full" data-slot="waveform-bars" {@attach painter.attach}
  ></canvas>
{/if}
