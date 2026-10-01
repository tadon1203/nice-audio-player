<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { formatDuration } from "$lib/utils/format";
  import { createPointerSeek } from "./pointer-seek.svelte";
  import WaveformBars from "./waveform-bars.svelte";
  import { barCountForWidth, resampleBars } from "./waveform-model";

  type Span = { startMs: number; endMs: number };

  /**
   * The seek bar, shared by the dock and Now Playing at different `height`s (the same object,
   * scaled by context). Bars grow upward from a baseline; played is Ink-1 and unplayed is dimmer.
   * Its size never changes for a given caller, so geometry stays stable while the waveform
   * loads. Before analysis finishes it is a 2px line, and the bars grow out of that same line.
   *
   * The fill and playhead are written straight from the one playback clock to those two
   * elements, so this component does not re-run with time. A custom property is deliberately
   * avoided: an inherited one would restyle every bar each frame.
   */
  let {
    height,
    rms,
    showPlayhead = true,
    valueMs,
    durationMs,
    watchClock,
    disabled,
    onInput,
    onCommit,
    activeSpan = null,
    hoveredLineSpan = null,
    onHoverPositionChange,
    sweepBars = false,
    stillBars = false,
    lineOnly = false,
    playedClassName = "text-foreground",
    class: className,
  }: {
    /** Bar height in px. The dock uses a slim meter; Now Playing grows the same object larger. */
    height: number;
    /** RMS buckets 0-255, or null while the backend analyzes the file. */
    rms: readonly number[] | null;
    /** The playhead tick and hover guideline. Off for the dock's plain bar, where the fill edge
     * already marks the position and a second line would be redundant. */
    showPlayhead?: boolean;
    /** The position to print and to announce, in ms. Changes about once a second. */
    valueMs: number;
    durationMs: number | null;
    /** Follows the playback clock's position (it moves every frame while playing) until the
     * returned function is called; it also keeps the clock's frame loop running meanwhile. */
    watchClock: (listener: (positionMs: number) => void) => () => void;
    disabled: boolean;
    onInput: (positionMs: number) => void;
    onCommit: (positionMs: number) => void;
    /** The current lyric line's span, lit over the waveform. */
    activeSpan?: Span | null;
    /** The hovered lyric line's span, faintly marked over the waveform. */
    hoveredLineSpan?: Span | null;
    /** Reports the hovered position so Now Playing can faintly mark the corresponding line. */
    onHoverPositionChange?: (positionMs: number | null) => void;
    /** Bars grow from left to right when the waveform arrives, instead of all at once. */
    sweepBars?: boolean;
    /** The bars appear without growing (calm or reduced motion). */
    stillBars?: boolean;
    /** A plain progress line with no bars (the dock): centred in its box. */
    lineOnly?: boolean;
    /** Colour class for the played part; the unplayed part is always dimmed ink. */
    playedClassName?: string;
    class?: string;
  } = $props();

  let width = $state(0);
  let grown = $state(false);
  const duration = $derived(durationMs ?? 0);
  const seekable = $derived(!disabled && duration > 0);
  const pointer = createPointerSeek(() => ({
    durationMs: duration,
    seekable,
    valueMs,
    onInput,
    onCommit,
    onHoverPositionChange,
  }));

  // The two elements the clock draws into. Each carries a static initial inline style, which
  // Svelte never rewrites, so the values written below stay put.
  let played = $state.raw<HTMLElement | null>(null);
  let playhead = $state.raw<HTMLElement | null>(null);
  const refTo =
    (set: (node: HTMLElement | null) => void): Attachment<HTMLElement> =>
    (node) => {
      set(node);
      return () => set(null);
    };
  const attachPlayed = refTo((node) => (played = node));
  const attachPlayhead = refTo((node) => (playhead = node));

  /**
   * Writes the played fraction to the fill's `clip-path` and the playhead's `left` from the
   * clock. While dragging it follows the pointer instead (`valueMs` is then the preview position).
   */
  $effect(() => {
    const fill = played;
    const tick = playhead;
    const total = duration;
    const preview = pointer.dragging ? valueMs : null;
    const draw = (positionMs: number) => {
      const position = preview ?? positionMs;
      const progress = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;
      if (fill) fill.style.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
      if (tick) tick.style.left = `${progress * 100}%`;
    };
    return watchClock(draw);
  });

  const hasPeaks = $derived(rms !== null && rms.length > 0);
  // The bars mount flat on the baseline and grow one frame later, so the growth can transition.
  // A refined waveform for the same track swaps the bars in place without growing again; the
  // caller keys this component by track, so a new track starts flat.
  $effect(() => {
    if (!hasPeaks) return;
    const frame = requestAnimationFrame(() => (grown = true));
    return () => cancelAnimationFrame(frame);
  });

  const bars = $derived(rms === null ? [] : resampleBars(rms, barCountForWidth(width)));

  const spanStyle = (span: Span) =>
    duration > 0
      ? `left: ${(Math.max(0, span.startMs) / duration) * 100}%; width: ${(Math.min(duration, span.endMs - span.startMs) / duration) * 100}%`
      : undefined;
</script>

{#snippet layer(className: string, style?: string, ref?: Attachment<HTMLElement>)}
  <div aria-hidden="true" class={cn("absolute inset-0", className)} {style} {@attach ref}>
    <WaveformBars {bars} {height} {grown} sweep={sweepBars} centered={lineOnly} still={stillBars} />
  </div>
{/snippet}

<div
  {@attach pointer.attach}
  bind:clientWidth={width}
  role="slider"
  tabindex={seekable ? 0 : -1}
  aria-label="Playback position"
  aria-orientation="horizontal"
  aria-valuemin={0}
  aria-valuemax={duration}
  aria-valuenow={Math.min(valueMs, duration)}
  aria-valuetext="{formatDuration(valueMs)} of {formatDuration(durationMs)}"
  aria-disabled={!seekable}
  data-region="seek"
  data-ready={hasPeaks ? "true" : "false"}
  class={cn(
    "relative touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
    seekable ? "cursor-pointer" : "cursor-default opacity-60",
    className,
  )}
  style:height="{height}px"
>
  {@render layer("text-foreground/35")}
  {@render layer(playedClassName, "clip-path: inset(0 100% 0 0)", attachPlayed)}
  {#if activeSpan !== null}
    <div
      aria-hidden="true"
      data-slot="waveform-active-span"
      class="absolute inset-y-0 bg-foreground/15"
      style={spanStyle(activeSpan)}
    ></div>
  {/if}
  {#if hoveredLineSpan !== null}
    <div
      aria-hidden="true"
      data-slot="waveform-hovered-span"
      class="absolute inset-y-0 bg-foreground/10"
      style={spanStyle(hoveredLineSpan)}
    ></div>
  {/if}
  {#if showPlayhead && duration > 0}
    <div
      aria-hidden="true"
      class="absolute inset-y-0 w-px bg-foreground"
      style="left: 0"
      data-slot="waveform-playhead"
      {@attach attachPlayhead}
    ></div>
  {/if}
  {#if seekable && pointer.hoverX !== null}
    {#if showPlayhead}
      <div
        aria-hidden="true"
        class="absolute inset-y-0 w-px bg-foreground/50"
        style:left="{pointer.hoverX}px"
      ></div>
    {/if}
    <span
      aria-hidden="true"
      data-slot="waveform-hover-time"
      class="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 rounded-sm bg-popover px-1.5 py-0.5 text-sm text-popover-foreground tabular-nums shadow-floating"
      style:left="{Math.min(width - 20, Math.max(20, pointer.hoverX))}px"
    >
      {#if pointer.dragging}
        {formatDuration(pointer.hoverMs)}
      {:else}
        <RollingNumber value={formatDuration(pointer.hoverMs)} />
      {/if}
    </span>
  {/if}
</div>
