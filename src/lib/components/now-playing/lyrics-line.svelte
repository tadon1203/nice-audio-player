<script lang="ts" module>
  /** The lyric type, sized by the width of the lyrics column (`cqi`), so the text fills it. */
  export const LYRICS_TEXT = "text-[clamp(1.5rem,5.5cqi,3rem)] leading-snug text-pretty";

  /** The Gutter shows the time on hover, on focus and while free-scrolling. */
  const SHOW_TIME =
    "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 in-data-[mode=free]:opacity-100";
  const HIDE_ON_TIME =
    "group-focus-within:opacity-0 group-hover:opacity-0 in-data-[mode=free]:opacity-0";
</script>

<script lang="ts">
  import { Play } from "@lucide/svelte";
  import type { Attachment } from "svelte/attachments";
  import type { LyricsTimedLine } from "$lib/native";
  import { getPlayback } from "$lib/playback/context";
  import { lyricsWaveformLink } from "$lib/shell/lyrics-waveform-link.svelte";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { cn } from "$lib/utils/cn.js";
  import { formatDuration } from "$lib/utils/format";
  import { opacityAtDistance } from "./distance-opacity";
  import IntervalLine from "./interval-line.svelte";
  import { lineSpan } from "./lyrics-lines";

  /**
   * One lyric line. It gets the current index and derives its own state from it, so a line change
   * only moves the few lines whose distance (capped) changes, not all of them.
   */
  let {
    lines,
    index,
    currentIndex,
    hoveredIndex,
    durationMs,
    attach,
  }: {
    lines: readonly LyricsTimedLine[];
    index: number;
    currentIndex: number;
    hoveredIndex: number;
    durationMs: number | null;
    /** Registers the line's element with the scroll follower. */
    attach: Attachment<HTMLElement>;
  } = $props();

  const playback = getPlayback();
  const budget = getMotionBudget();

  const line = $derived(lines[index]!);
  const isInterval = $derived(line.text.trim() === "");
  const isCurrent = $derived(index === currentIndex);
  const isPast = $derived(index < currentIndex);
  const isHovered = $derived(index === hoveredIndex);
  /** Lines away from the current one, capped: how much dimmer the line is. */
  const distance = $derived(Math.abs(index - Math.max(currentIndex, 0)));
  const startLabel = $derived(formatDuration(line.startMs));

  // Luminance moves as a small move; under reduced motion it is the shared short crossfade.
  const motion = $derived(motionFor("smallMove", budget.current === "reduced"));
  const transition = (property: string) =>
    `${property} ${motion.duration}ms cubic-bezier(0.2, 0, 0, 1)`;
</script>

<div
  {@attach attach}
  aria-current={isCurrent ? "true" : undefined}
  style:opacity={opacityAtDistance(distance)}
  style:transition={transition("opacity")}
  class={cn("group flex items-baseline gap-4 rounded-sm py-2", isHovered && "bg-accent/60")}
>
  <button
    type="button"
    data-slot="lyrics-gutter"
    aria-label={`Seek to ${startLabel}`}
    onclick={() => void playback.seek(line.startMs)}
    onpointerenter={() => lyricsWaveformLink.setHoveredLineSpan(lineSpan(lines, index, durationMs))}
    onpointerleave={() => lyricsWaveformLink.setHoveredLineSpan(null)}
    class="relative w-16 shrink-0 cursor-pointer text-right text-sm tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span class={SHOW_TIME}>{startLabel}</span>
    <!-- The present is marked with ▶ in the artwork's colour until the time takes its place. -->
    {#if isCurrent}
      <Play
        aria-hidden="true"
        class={cn(
          "absolute top-1/2 right-0 size-3.5 -translate-y-1/2 fill-(--artwork-accent) text-(--artwork-accent)",
          HIDE_ON_TIME,
        )}
      />
    {/if}
  </button>
  {#if isInterval}
    <IntervalLine
      startMs={line.startMs}
      endMs={lineSpan(lines, index, durationMs)?.endMs ?? null}
      {isCurrent}
    />
  {:else}
    <span class={cn("relative", LYRICS_TEXT)}>
      <!-- Past is faintest, the present brightest, the future between; the current line is lit in the artwork's colour. -->
      <span
        style:transition={transition("color")}
        class={isCurrent
          ? "text-(--artwork-accent)"
          : isPast
            ? "text-faint-foreground"
            : "text-muted-foreground"}
      >
        {line.text}
      </span>
    </span>
  {/if}
</div>
