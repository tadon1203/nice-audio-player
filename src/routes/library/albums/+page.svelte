<script lang="ts">
  import { createLibraryCatalog } from "$lib/library/catalog.svelte";
  import { albumSortOptions } from "$lib/library/sort";
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
  sort={{
    key: view.sortKey,
    direction: view.direction,
    options: albumSortOptions,
    onkeychange: (key) => view.setSort(key),
    ontoggledirection: view.toggleDirection,
  }}
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
      initialOffset={scroll.initialOffset}
      itemKey={(album) => `${album.key.albumArtist}\u0000${album.key.title}`}
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
