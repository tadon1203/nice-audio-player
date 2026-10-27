<script lang="ts">
  import { type ArtistId, type AlbumListItem } from "#lib/native/bindings";
  import { resolve } from "$app/paths";
  import { albumTitleLabel, artistNameLabel } from "#lib/library/tracks";
  import Artwork from "#lib/components/ui/artwork.svelte";
  import { SharedElement } from "#lib/components/ui/motion/shared-element";
  import PlayPauseIcon from "#lib/components/ui/play-pause-icon.svelte";
  import { Button } from "#lib/components/ui/shadcn/button/index.js";
  import { MISSING } from "#lib/utils/missing";

  let {
    album,
    onplay,
    showArtist = true,
    parentArtistId = null,
  }: {
    album: AlbumListItem;
    onplay?: (album: AlbumListItem) => void;
    /** False where the artist is already the context (an artist's own albums). */
    showArtist?: boolean;
    /** Set on an Album Artist's page, so the album's Back link returns there. */
    parentArtistId?: ArtistId | null;
  } = $props();

  const title = $derived(albumTitleLabel(album.title));
  const artist = $derived(artistNameLabel(album.albumArtist.name));
  // Opened from an Album Artist's page, the album is reached through that artist, so Back returns.
  const href = $derived(
    parentArtistId === null
      ? resolve("/library/albums/[albumId=albumId]", { albumId: album.id })
      : resolve("/library/album-artists/[artistId=artistId]/albums/[albumId=albumId]", {
          artistId: parentArtistId,
          albumId: album.id,
        }),
  );
</script>

<!-- An artwork-led album entry. Titles are not headings: tiles belong to a list. -->
<div class="group/tile relative min-w-0">
  <a
    {href}
    aria-label={showArtist ? `Open album ${title} by ${artist}` : `Open album ${title}`}
    class="group block min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <Artwork
      artwork={album.artwork}
      alt="{title} artwork"
      {@attach SharedElement.attach(album.id)}
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
      <div
        class="pointer-events-auto absolute right-2 bottom-2 opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <Button
          type="button"
          size="largeIcon"
          variant="primary"
          aria-label="Play {title}"
          onclick={() => onplay(album)}
          class="rounded-full"
        >
          <PlayPauseIcon playing={false} />
        </Button>
      </div>
    </div>
  {/if}
</div>
