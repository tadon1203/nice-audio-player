<script lang="ts">
  import { createLibraryCatalog } from "$lib/library/catalog.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import VirtualMediaGrid from "$lib/ui/media-grid/virtual-media-grid.svelte";
  import { sortIndexLetter } from "$lib/utils/sort-index";
  import AlbumTile from "../album-tile.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Albums",
    singular: "album",
    plural: "albums",
    searchLabel: "Search albums",
    searchPlaceholder: "Search albums…",
  };

  const view = libraryViews.albums;
  const catalog = createLibraryCatalog(() => view.request);
  const playback = getPlayback();
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/albums"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  sort={view}
  {catalog}
  indexFor={(album) =>
    view.sortKey === "year"
      ? (album.year?.toString() ?? "#")
      : sortIndexLetter(view.sortKey === "artist" ? album.key.albumArtist : album.key.title)}
>
  {#snippet content(albums, scroll)}
    <VirtualMediaGrid
      items={albums}
      scrollElement={scroll.viewport}
      itemKey={(album) => `${album.key.albumArtist}\u0000${album.key.title}`}
      artworkAt={(index) => albums[index]?.artwork}
      sortSignature={view.sortSignature}
      ontopindexchange={scroll.ontopindexchange}
    >
      {#snippet tile(album)}
        <AlbumTile
          {album}
          onplay={(played) => void playback.startPlayback({ kind: "album", key: played.key }, null)}
        />
      {/snippet}
    </VirtualMediaGrid>
  {/snippet}
</LibraryWorkspace>
