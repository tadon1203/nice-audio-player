<script lang="ts">
  import { albumItemKey } from "#lib/library/album-key";
  import { LibraryCatalog } from "#lib/library/library-catalog.svelte";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import VirtualMediaGrid from "#lib/ui/media-grid/virtual-media-grid.svelte";
  import AlbumTile from "../album-tile.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Albums",
    singular: "album",
    plural: "albums",
    searchLabel: "Search albums",
    searchPlaceholder: "Search albums…",
  };

  const services = AppServices.current();
  const { playback, actions, libraryViews } = services;
  const view = libraryViews.albums;
  const catalog = new LibraryCatalog(services.catalog, () => view.request);
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/albums"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  sort={view}
  {catalog}
  skip={view.skip}
  onjump={view.jumpTo}
>
  {#snippet content(albums, scroll)}
    <VirtualMediaGrid
      items={albums}
      scrollElement={scroll.viewport}
      itemKey={(album) => albumItemKey(album.key)}
      artworkAt={(index) => albums[index]?.artwork}
      sortSignature={view.sortSignature}
      ontopindexchange={scroll.ontopindexchange}
    >
      {#snippet tile(album)}
        <AlbumTile
          {album}
          onplay={(played) =>
            actions.run(() => playback.start({ kind: "album", key: played.key }, null))}
        />
      {/snippet}
    </VirtualMediaGrid>
  {/snippet}
</LibraryWorkspace>
