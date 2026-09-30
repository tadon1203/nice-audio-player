<script lang="ts">
  import type { LibraryAlbumSummary } from "$lib/native";
  import { albumHref } from "$lib/library/routes";
  import { albumTitleLabel, artistNameLabel } from "$lib/library/unknown-name";
  import Artwork from "$lib/ui/artwork.svelte";
  import PlayPauseIcon from "$lib/ui/play-pause-icon.svelte";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { MISSING } from "$lib/utils/format";

  let {
    album,
    onplay,
    showArtist = true,
  }: {
    album: LibraryAlbumSummary;
    onplay?: (album: LibraryAlbumSummary) => void;
    /** False where the artist is already the context (an artist's own albums). */
    showArtist?: boolean;
  } = $props();

  const title = $derived(albumTitleLabel(album.key.title));
  const artist = $derived(artistNameLabel(album.key.albumArtist));
  const href = $derived(albumHref(album.key.albumArtist, album.key.title));
</script>

<!-- An artwork-led album entry. Titles are not headings: tiles belong to a list. -->
<div class="group/tile relative min-w-0">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a
    {href}
    aria-label={showArtist ? `Open album ${title} by ${artist}` : `Open album ${title}`}
    class="group block min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <Artwork
      artwork={album.artwork}
      alt="{title} artwork"
      class="[&_img]:transition-transform group-hover:[&_img]:scale-[1.04]"
    />
    <div class="mt-3 min-w-0">
      <p class="truncate text-sm font-medium text-foreground" {title}>{title}</p>
      <div class="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {#if showArtist}
          <span class="min-w-0 flex-1 truncate" title={artist}>{artist}</span>
        {:else}
          <span class="min-w-0 flex-1"></span>
        {/if}
        <span class="shrink-0 tabular-nums">{album.year ?? MISSING}</span>
      </div>
    </div>
  </a>
  <!-- Beside the link, not inside it: the tile opens the album, this starts it. -->
  {#if onplay}
    <div class="pointer-events-none absolute inset-x-0 top-0 aspect-square">
      <Button
        type="button"
        size="icon-lg"
        class="pointer-events-auto absolute right-2 bottom-2 rounded-full opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        aria-label="Play {title}"
        onclick={() => onplay(album)}
      >
        <PlayPauseIcon playing={false} />
      </Button>
    </div>
  {/if}
</div>
