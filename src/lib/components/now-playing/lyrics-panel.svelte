<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { createTrackLyrics } from "$lib/lyrics/lyrics.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { lyricsWaveformLink } from "$lib/shell/lyrics-waveform-link.svelte";
  import { Button } from "$lib/ui/shadcn/button";
  import { cn } from "$lib/utils/cn.js";
  import { EDGE_MASK } from "./anchor-column";
  import { createAnchorPadding } from "./anchor-column.svelte";
  import LyricsLine, { LYRICS_TEXT } from "./lyrics-line.svelte";
  import { createLyricsFollow } from "./lyrics-follow.svelte";
  import { findCurrentLineIndex, lineSpan, withIntro } from "./lyrics-lines";
  import { createLyricsSync } from "./lyrics-sync.svelte";

  /**
   * Local LRC lyrics: synced (Gutter, auto-scroll, waveform link) or plain (static). Now Playing
   * shows it only once the lyrics are resolved; why there are none is said in its Facts line. The
   * current line sits 40% from the top, and a long intro shows as a gap bar.
   * Only a change of the current line reaches the lines: only the gap bar of an instrumental line
   * follows the playback clock, through styles.
   */
  let { trackId, class: className }: { trackId: string | null; class?: string } = $props();

  const playback = getPlayback();
  const lyrics = createTrackLyrics(() => trackId);
  const resolution = $derived(lyrics.data?.status === "resolved" ? lyrics.data : null);
  const content = $derived(resolution?.document.content ?? null);
  const rawLines = $derived(content?.kind === "timed" ? content.lines : null);
  const timedLines = $derived(rawLines === null ? null : withIntro(rawLines));

  const sync = createLyricsSync(() => timedLines);
  const follow = createLyricsFollow(() => sync.index);
  const anchor = createAnchorPadding();

  const hoveredIndex = $derived(
    lyricsWaveformLink.hoveredWaveformMs === null || timedLines === null
      ? -1
      : findCurrentLineIndex(timedLines, lyricsWaveformLink.hoveredWaveformMs),
  );

  // The spacers change size when the panel is measured or resized: keep the present on the anchor.
  $effect(() => {
    void anchor.height;
    follow.realign();
  });

  $effect(() => {
    const lines = timedLines;
    const index = sync.index;
    const durationMs = playback.durationMs;
    lyricsWaveformLink.setActiveSpan(
      lines !== null && index >= 0 ? lineSpan(lines, index, durationMs) : null,
    );
    return () => lyricsWaveformLink.setActiveSpan(null);
  });
</script>

{#if content?.kind === "plain"}
  <div class={cn("flex h-full min-h-0 flex-col", className)}>
    <div class={cn("min-h-0 flex-1 overflow-y-auto pl-20", EDGE_MASK)}>
      {#each content.lines as line, index (index)}
        <p class={cn(LYRICS_TEXT, "text-foreground")}>{line.length > 0 ? line : " "}</p>
      {/each}
    </div>
  </div>
{:else if timedLines !== null}
  <div class={cn("relative flex h-full min-h-0 flex-col", className)}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      {@attach follow.container}
      {@attach anchor.attach}
      data-mode={follow.mode}
      role="log"
      aria-label="Lyrics"
      tabindex="0"
      onwheel={follow.onwheel}
      ontouchstart={follow.ontouchstart}
      onpointerdown={follow.onpointerdown}
      onkeydown={follow.onkeydown}
      class={cn("relative min-h-0 flex-1 overflow-y-auto outline-none", EDGE_MASK)}
    >
      <div aria-hidden="true" class="transition-none" style:height="{anchor.top}px"></div>
      {#each timedLines as _line, index (index)}
        <LyricsLine
          lines={timedLines}
          {index}
          currentIndex={sync.index}
          {hoveredIndex}
          durationMs={playback.durationMs}
          attach={follow.line(index)}
        />
      {/each}
      <div aria-hidden="true" class="transition-none" style:height="{anchor.bottom}px"></div>
    </div>
    {#if follow.mode === "free" && follow.offscreen !== null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onclick={follow.jumpToCurrent}
        class={cn("absolute left-20", follow.offscreen === "above" ? "top-2" : "bottom-2")}
      >
        {#if follow.offscreen === "above"}
          <ArrowUp aria-hidden="true" />
        {:else}
          <ArrowDown aria-hidden="true" />
        {/if}
        Jump to current line
      </Button>
    {/if}
  </div>
{/if}
