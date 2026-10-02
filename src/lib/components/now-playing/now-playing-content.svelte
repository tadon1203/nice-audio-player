<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import PlaybackWaveformBand from "$lib/components/waveform-band/playback-waveform-band.svelte";
  import { createTrackLyrics } from "$lib/lyrics/lyrics.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { cn } from "$lib/utils/cn.js";
  import Identity from "./identity.svelte";
  import LyricsPanel from "./lyrics-panel.svelte";
  import { SLEEVE_SIZE, contentFade, waveformHeightFor } from "./now-playing-layout";
  import NowPlayingLight from "./now-playing-light.svelte";
  import QueueColumn from "./queue-column.svelte";
  import UpNext from "./up-next.svelte";

  /**
   * Now Playing's content: one skeleton in every state. Left, the Sleeve and the track's info;
   * right, what this playback is doing now: its lyrics, or else the queue in the order it plays,
   * the current line or track always 40% from the top. Beside lyrics, from 90rem, a rail of the
   * upcoming tracks; below that the next track sits at the end of the waveform band instead
   * (never both, and never beside a queue that already shows it). The Sleeve continues its
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
      class={cn(
        "flex h-full min-h-0 min-w-0 flex-col md:grid md:grid-rows-[minmax(0,1fr)] md:gap-12 md:p-8",
        showLyrics
          ? "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)] @min-[90rem]/npw:grid-cols-[var(--np-sleeve)_minmax(0,1fr)_20rem]"
          : "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)]",
      )}
      style:--np-sleeve={SLEEVE_SIZE}
    >
      <div class="flex min-h-0 min-w-0 flex-col gap-4 p-6 md:w-(--np-sleeve) md:p-0">
        <Identity {item} resolution={resolution ?? null} />
      </div>
      <!-- An inline-size container: the text is sized from this column's width (`cqi`). -->
      {#key `${showLyrics ? "lyrics" : "queue"}:${trackId ?? "none"}`}
        <div
          in:contentFade|global
          class="min-h-0 min-w-0 flex-1 p-6 pt-0 [container-type:inline-size] md:p-0"
        >
          {#if showLyrics}
            <LyricsPanel {trackId} class="h-full" />
          {:else}
            <QueueColumn variant="full" />
          {/if}
        </div>
      {/key}
      {#if showLyrics}
        <QueueColumn variant="rail" class="hidden @min-[90rem]/npw:flex" />
      {/if}
    </div>
  </div>
  {#snippet upNext()}
    <UpNext class="@min-[90rem]/npw:hidden" />
  {/snippet}
  <PlaybackWaveformBand
    height={waveformHeightFor(layerHeight)}
    class="relative shrink-0 border-t border-border/50 px-6 py-4"
    timeClass="text-sm"
    trailing={showLyrics ? upNext : undefined}
  />
</div>
