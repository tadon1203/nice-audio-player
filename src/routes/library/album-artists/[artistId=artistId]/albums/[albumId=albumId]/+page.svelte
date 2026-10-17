<script lang="ts">
  import type { AlbumId, ArtistId } from "#lib/native";
  import type { Snapshot } from "./$types";
  import { page } from "$app/state";
  import AlbumPage from "../../../../album-page.svelte";

  const albumId = $derived(page.params.albumId as AlbumId);
  const artistId = $derived(page.params.artistId as ArtistId);

  // The scroll position belongs to the album page; this route hands it to SvelteKit's `snapshot`.
  let albumPage = $state<{ snapshot: Snapshot<number> }>();

  export const snapshot: Snapshot<number> = {
    capture: () => albumPage?.snapshot.capture() ?? 0,
    restore: (offset) => albumPage?.snapshot.restore(offset),
  };
</script>

<AlbumPage bind:this={albumPage} {albumId} parentArtistId={artistId} />
