<script lang="ts">
  import type { ArtistRow } from "#lib/native";
  import { resolve } from "$app/paths";
  import { artistNameLabel } from "#lib/library/unknown-name";
  import Artwork from "#lib/ui/artwork.svelte";
  import { CountFormat } from "#lib/utils/count-format";

  let { artist }: { artist: ArtistRow } = $props();

  const name = $derived(artistNameLabel(artist.name));
  const href = $derived(
    resolve("/library/album-artists/[artistId=artistId]", { artistId: artist.id }),
  );
</script>

<!-- An artwork-led album artist entry. -->
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
    <span>{CountFormat.count(artist.albumCount, "album")}</span>
    <span>{CountFormat.count(artist.trackCount, "track")}</span>
  </p>
</a>
