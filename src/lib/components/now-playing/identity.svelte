<script lang="ts">
  import { untrack } from "svelte";
  import type { LyricsResolution, PlaybackItem } from "$lib/native";
  import { getPlayback } from "$lib/playback/context";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import Artwork from "$lib/ui/artwork.svelte";
  import KineticText from "$lib/ui/kinetic-text/kinetic-text.svelte";
  import { SLEEVE_RADIUS, sharedElement, sharedKey } from "$lib/ui/motion/shared-element";
  import { contentFade } from "./now-playing-layout";
  import TrackFacts from "./track-facts.svelte";

  /**
   * The Sleeve with the title, artist, album and facts, stacked (side by side below `md`). The
   * Sleeve is the shared element that flies in from the dock; the text is not shared, it fades
   * in behind it.
   */
  let {
    item,
    resolution,
  }: {
    item: PlaybackItem | null;
    resolution: LyricsResolution | null;
  } = $props();

  const playback = getPlayback();
  // The title wipes in on track changes, but not when Now Playing first opens.
  const openedOn = untrack(() => item?.queueItemId);
  const changedSinceOpen = $derived(item?.queueItemId !== openedOn);
</script>

<div class="flex min-w-0 gap-4 max-md:items-center md:flex-col">
  <div class="relative size-16 shrink-0 md:size-(--np-sleeve)">
    <!-- Attached only while open, so the departure is recorded the moment closing begins, not
    after the layer has finished fading out. -->
    <div
      {@attach nowPlaying.isOpen ? sharedElement(sharedKey.sleeve) : undefined}
      class="relative size-full overflow-hidden"
      style:border-radius={SLEEVE_RADIUS}
    >
      <Artwork
        artwork={item?.artwork ?? null}
        alt={item === null ? "" : `${item.title} artwork`}
        loading="eager"
        level="full"
        class="size-full rounded-none"
      />
    </div>
  </div>
  {#key item?.queueItemId ?? "none"}
    <div in:contentFade|global class="flex min-w-0 flex-col gap-1">
      <!-- Always two lines tall, so the lines below never move when the title wraps differently. -->
      <p
        class="line-clamp-2 min-h-[2lh] text-2xl font-medium text-foreground md:text-3xl lg:text-4xl"
      >
        {#if item !== null && changedSinceOpen}
          <KineticText
            text={item.title}
            direction={playback.lastNavigation === "previous" ? -1 : 1}
          />
        {:else}
          {item?.title ?? "Nothing playing"}
        {/if}
      </p>
      <TrackFacts {item} {resolution} />
    </div>
  {/key}
</div>
