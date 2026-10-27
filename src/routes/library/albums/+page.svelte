<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import VirtualMediaGrid from "#lib/components/ui/media-grid/virtual-media-grid.svelte";
  import AlbumTile from "../album-tile.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Albums",
    singular: "album",
    plural: "albums",
    searchLabel: "Search albums",
    searchPlaceholder: "Search albums…",
  };

  const { player: playback, actions, library } = useApp();
  const view = library.albums;
  const catalog = library.catalog(() => view.request);
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
      itemKey={(album) => album.id}
      artworkAt={(index) => albums[index]?.artwork}
      sortSignature={view.sortSignature}
      ontopindexchange={scroll.ontopindexchange}
    >
      {#snippet tile(album)}
        <AlbumTile
          {album}
          onplay={(played) =>
            actions.run(() => playback.play({ kind: "album", albumId: played.id }, null))}
        />
      {/snippet}
    </VirtualMediaGrid>
  {/snippet}
</LibraryWorkspace>
