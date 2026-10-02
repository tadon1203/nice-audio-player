<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import PlaybackWaveformBand from "$lib/components/waveform-band/playback-waveform-band.svelte";
  import { createTrackLyrics } from "$lib/lyrics/lyrics.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { cn } from "$lib/utils/cn.js";
  import Identity from "./identity.svelte";
  import LyricsPanel from "./lyrics-panel.svelte";
  import {
    SLEEVE_SIZE,
    columnFade,
    contentFade,
    lyricsSwap,
    waveformHeightFor,
  } from "./now-playing-layout";
  import NowPlayingLight from "./now-playing-light.svelte";
  import QueueColumn from "./queue-column.svelte";
  import { rightColumn } from "./right-column.svelte";
  import { Button } from "$lib/ui/shadcn/button";

  /**
   * Now Playing's content: one skeleton in every state. Left, the Sleeve and the track's info;
   * right, what this playback is doing now: its lyrics, or else the queue in the order it plays,
   * the current line or track always 40% from the top. Beside lyrics, from 90rem, the same queue
   * is a rail; below that a Lyrics / Queue switch above the column chooses one of them (the
   * choice is kept for the session). The queue stays mounted: only its place changes, so it
   * keeps its scroll and its rows move instead of being re-created. The Sleeve continues its
   * shared-element motion from the dock; the text is not shared, it fades in behind the Sleeve.
   * Below `md` everything stacks. The waveform grows along the bottom edge when its data arrives.
   */
  const playback = getPlayback();
  const item = $derived(playback.item);
  const trackId = $derived(item?.trackId ?? null);
  const lyrics = createTrackLyrics(() => trackId);
  const resolution = $derived(lyrics.data);

  // While lyrics are loading keep the column the previous track had, so it does not flip twice
  // (they are also fetched ahead of time). The first ever render starts from what is cached.
  let showLyrics = $state(untrack(() => resolution?.status === "resolved"));
  $effect.pre(() => {
    if (resolution !== undefined) showLyrics = resolution.status === "resolved";
  });

  // Which way the track changed, for the lyrics to leave and arrive in: going back puts the track
  // we left first among the upcoming ones.
  let direction = $state<"next" | "previous">("next");
  let lastTrackId: string | null = untrack(() => trackId);
  $effect.pre(() => {
    const id = trackId;
    if (id === lastTrackId) return;
    const left = lastTrackId;
    lastTrackId = id;
    direction =
      left !== null && playback.queue?.upcoming[0]?.trackId === left ? "previous" : "next";
  });

  // The band gives way to the content, so it needs to know how much room the layer has.
  let layerHeight = $state(720);
  const observeHeight: Attachment<HTMLElement> = (node) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) layerHeight = entry.contentRect.height;
    });
    observer.observe(node);
    return () => observer.disconnect();
  };
</script>

<div {@attach observeHeight} class="@container/npw relative flex h-full min-h-0 min-w-0 flex-col">
  <NowPlayingLight />
  <!-- The size container: the layer without the waveform band, and without padding. -->
  <div class="relative min-h-0 min-w-0 flex-1 [container-name:np] [container-type:size]">
    <div
      class="flex h-full min-h-0 min-w-0 flex-col md:grid md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-12 md:p-8"
      style:--np-sleeve={SLEEVE_SIZE}
    >
      <div class="flex min-h-0 min-w-0 flex-col gap-4 p-6 md:w-(--np-sleeve) md:p-0">
        <Identity {item} resolution={resolution ?? null} />
      </div>
      <!--
        The right column. The lyrics and the queue are cells of one grid: stacked below 90rem (the
        switch picks one), side by side from there. Each is an inline-size container: its text is
        sized from its own width (`cqi`).
      -->
      <div
        in:contentFade|global
        class={cn(
          "grid min-h-0 min-w-0 flex-1 gap-y-3 p-6 pt-0 md:p-0",
          showLyrics
            ? "grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] @min-[90rem]/npw:grid-cols-[minmax(0,1fr)_20rem] @min-[90rem]/npw:grid-rows-[minmax(0,1fr)] @min-[90rem]/npw:gap-x-12"
            : "grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]",
        )}
      >
        {#if showLyrics}
          <div
            role="group"
            aria-label="Show"
            class="row-start-1 flex gap-1 @min-[90rem]/npw:hidden"
          >
            {#each ["lyrics", "queue"] as const as view (view)}
              <Button
                type="button"
                size="sm"
                variant={rightColumn.view === view ? "secondary" : "ghost"}
                aria-pressed={rightColumn.view === view}
                onclick={() => (rightColumn.view = view)}
              >
                {view === "lyrics" ? "Lyrics" : "Queue"}
              </Button>
            {/each}
          </div>
          <div
            transition:columnFade
            class={cn(
              "col-start-1 row-start-2 grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] [container-type:inline-size] @min-[90rem]/npw:row-start-1",
              rightColumn.view === "queue" && "hidden @min-[90rem]/npw:grid",
            )}
          >
            {#key trackId}
              <div
                in:lyricsSwap={{ direction, leaving: false }}
                out:lyricsSwap={{ direction, leaving: true }}
                class="col-start-1 row-start-1 min-h-0"
              >
                <LyricsPanel {trackId} class="h-full" />
              </div>
            {/key}
          </div>
        {/if}
        <div
          class={cn(
            "col-start-1 min-h-0 [container-type:inline-size]",
            showLyrics
              ? "row-start-2 @min-[90rem]/npw:col-start-2 @min-[90rem]/npw:row-start-1"
              : "row-start-1",
            showLyrics && rightColumn.view === "lyrics" && "hidden @min-[90rem]/npw:block",
          )}
        >
          <QueueColumn />
        </div>
      </div>
    </div>
  </div>
  <PlaybackWaveformBand
    height={waveformHeightFor(layerHeight)}
    class="relative shrink-0 border-t border-border/50 px-6 py-4"
    timeClass="text-sm"
  />
</div>
