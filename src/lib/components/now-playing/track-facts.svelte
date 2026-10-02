<script lang="ts">
  import type { LyricsResolution, PlaybackItem } from "$lib/native";
  import { createPlaybackSignalPath } from "$lib/components/signal-path/signal-path.svelte";
  import FactLine from "$lib/ui/fact-line.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { trackLinks } from "$lib/library/tracks";
  import { lyricsState, trackFacts } from "./track-facts";

  /**
   * Artist and album, each a link to its page (following one closes Now Playing: page state is
   * not carried across navigation), then `2019  Disc 2  Track 4  FLAC 24/96  No lyrics`: what the
   * library knows, what is really decoded, and the lyrics' state.
   */
  let {
    item,
    resolution,
  }: {
    item: PlaybackItem | null;
    resolution: LyricsResolution | null;
  } = $props();

  const linkClass =
    "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

  const signalPath = createPlaybackSignalPath();
  const links = $derived(item === null ? null : trackLinks(item));
  const artistHref = $derived(links?.artist?.href ?? null);
  const albumLinkHref = $derived(links?.album?.href ?? null);
  const lyrics = $derived(item === null ? null : lyricsState(item, resolution));

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }
</script>

{#if item !== null && links !== null}
  {#if links.artist !== null}
    <p class="truncate text-base text-foreground">
      {#if artistHref !== null}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={artistHref} class={linkClass}>{links.artist.text}</a>
      {:else}
        {links.artist.text}
      {/if}
    </p>
  {/if}
  {#if links.album !== null}
    <p class="truncate text-sm text-foreground [@container(max-height:520px)]:hidden">
      {#if albumLinkHref !== null}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={albumLinkHref} class={linkClass}>{links.album.text}</a>
      {:else}
        {links.album.text}
      {/if}
    </p>
  {/if}
  <div class="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted-foreground">
    <FactLine facts={trackFacts(item, signalPath.current?.source)} />
    {#if lyrics?.kind === "notFound"}
      <span>No lyrics</span>
    {:else if lyrics?.kind === "sourceFailed"}
      <button
        type="button"
        title="{lyrics.expectedPath} (click to copy)"
        onclick={() => copy(lyrics.expectedPath)}
        class={cn("cursor-pointer", linkClass)}
      >
        Lyrics file unreadable
      </button>
    {:else if lyrics?.kind === "embedded"}
      <span title="The .lrc file couldn't be read.">Embedded lyrics</span>
    {:else if lyrics?.kind === "unsynced"}
      <span>Unsynced lyrics</span>
    {/if}
  </div>
{/if}
