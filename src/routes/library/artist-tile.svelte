<script lang="ts">
  import type { LibraryAlbumArtistSummary } from "$lib/native";
  import { albumArtistHref } from "$lib/library/routes";
  import { artistNameLabel } from "$lib/library/unknown-name";
  import Artwork from "$lib/ui/artwork.svelte";
  import { formatCount } from "$lib/utils/format";

  let { artist }: { artist: LibraryAlbumArtistSummary } = $props();

  const name = $derived(artistNameLabel(artist.key.name));
  const href = $derived(albumArtistHref(artist.key.name));
</script>

<!-- An artwork-led album artist entry. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a
  {href}
  aria-label="Browse albums by {name}"
  class="group block min-w-0 rounded-lg text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
>
  <Artwork
    artwork={artist.artwork}
    alt="{name} artwork"
    round
    class="[&_img]:transition-transform group-hover:[&_img]:scale-[1.04]"
  />
  <p class="mt-3 truncate text-sm font-medium text-foreground" title={name}>{name}</p>
  <p class="mt-1 flex justify-center gap-x-4 text-sm text-muted-foreground tabular-nums">
    <span>{formatCount(artist.albumCount, "album")}</span>
    <span>{formatCount(artist.trackCount, "track")}</span>
  </p>
</a>
