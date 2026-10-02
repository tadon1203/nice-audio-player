<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { springEasing } from "$lib/ui/motion/spring-curve";
  import { delayOf, tokenDuration } from "$lib/ui/motion/tokens";
  import { tweenNumber } from "$lib/ui/motion/tween-number";
  import { cn } from "$lib/utils/cn.js";
  import { levelToUnit } from "./waveform-model";

  /** Height of the flat line the bars grow out of, in px. */
  const BASELINE = 2;
  /** Total time for the growth to sweep from the first bar to the last. */
  const SWEEP_MS = delayOf("move", 1.45);
  /** How long one bar takes to grow. */
  const MOVE_MS = tokenDuration("move", false);

  /**
   * The drawing only: a baseline, and bars growing upward from it, each an RMS level on a dB
   * scale. Colour comes from the caller (`currentColor`), so one instance serves the played and
   * the unplayed layer. The bars are painted on one canvas (a few hundred rects per layer would
   * make the page heavy), in the canvas's computed `color`, with the same per-bar growth the
   * spring curve gave them as transitions.
   */
  let {
    bars,
    height,
    grown,
    sweep,
    centered = false,
    still = false,
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
    /** The bars appear without growing: the caller's motion budget does not allow it. */
    still?: boolean;
  } = $props();

  let canvas = $state.raw<HTMLCanvasElement | null>(null);
  // Elapsed growth time in ms; infinity is fully grown. Not reactive: only drawing reads it.
  let elapsed = 0;
  let wasGrown = false;

  const attachCanvas: Attachment<HTMLCanvasElement> = (node) => {
    canvas = node;
    return () => (canvas = null);
  };

  /** Paints every bar for the current `elapsed`: one fillRect each, nothing allocated. */
  function draw() {
    const node = canvas;
    const ctx = node?.getContext("2d");
    if (!node || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = node.clientWidth;
    const pxWidth = Math.round(cssWidth * dpr);
    const pxHeight = Math.round(height * dpr);
    // Assigning a size clears the canvas, so only do it when it changed.
    if (node.width !== pxWidth) node.width = pxWidth;
    if (node.height !== pxHeight) node.height = pxHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    ctx.fillStyle = getComputedStyle(node).color;
    const count = bars.length;
    const unit = cssWidth / count;
    for (let index = 0; index < count; index += 1) {
      const full = Math.max(BASELINE, levelToUnit(bars[index]!) * (height - 2));
      const delay = sweep ? (index / count) * SWEEP_MS : 0;
      const progress = springEasing(Math.min(1, Math.max(0, (elapsed - delay) / MOVE_MS)));
      const barHeight = BASELINE + (full - BASELINE) * progress;
      ctx.fillRect((index + 0.15) * unit, height - barHeight, 0.7 * unit, barHeight);
    }
  }

  // Size and colour are read on every draw, so a resize or a colour-class change only needs to
  // trigger one. The colour comes from a class on the layer, or the theme and the accent on the root.
  $effect(() => {
    const node = canvas;
    if (!node) return;
    untrack(draw);
    const resize = new ResizeObserver(() => draw());
    resize.observe(node);
    const recolour = new MutationObserver(() => draw());
    const filter = { attributes: true, attributeFilter: ["class"] };
    if (node.parentElement) recolour.observe(node.parentElement, filter);
    // The root also carries `--artwork-accent` as inline style, set once the artwork is analyzed.
    recolour.observe(document.documentElement, { ...filter, attributeFilter: ["class", "style"] });
    return () => {
      resize.disconnect();
      recolour.disconnect();
    };
  });

  // New or refined bars, or a new height, repaint in place at the current growth.
  $effect(() => {
    void bars;
    void height;
    if (canvas) draw();
  });

  // Flipping `grown` to true grows the bars; they only grow if they are already on screen.
  $effect(() => {
    if (!grown) {
      wasGrown = false;
      elapsed = 0;
      untrack(draw);
      return;
    }
    if (wasGrown) return;
    wasGrown = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || reduced || !untrack(() => canvas)) {
      elapsed = Number.POSITIVE_INFINITY;
      untrack(draw);
      return;
    }
    const total = MOVE_MS + (sweep ? SWEEP_MS : 0);
    const tween = tweenNumber(0, total, {
      duration: total,
      easing: (t) => t,
      onUpdate: (value) => {
        elapsed = value;
        draw();
      },
      onComplete: () => (elapsed = Number.POSITIVE_INFINITY),
    });
    return () => {
      tween.stop();
      elapsed = Number.POSITIVE_INFINITY;
    };
  });
</script>

<div
  class={cn("absolute inset-x-0 bg-current", centered ? "top-1/2 -translate-y-1/2" : "bottom-0")}
  style:height="{BASELINE}px"
  data-slot="waveform-baseline"
></div>
{#if bars.length > 0}
  <canvas class="absolute inset-0 size-full" data-slot="waveform-bars" {@attach attachCanvas}
  ></canvas>
{/if}
