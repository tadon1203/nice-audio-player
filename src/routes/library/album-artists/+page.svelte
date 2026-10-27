<script lang="ts">
  import { LibraryCatalog } from "#lib/library/library-catalog.svelte";
  import { useApp } from "#lib/app/app.svelte";
  import VirtualMediaGrid from "#lib/ui/media-grid/virtual-media-grid.svelte";
  import ArtistTile from "../artist-tile.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Album Artists",
    singular: "album artist",
    plural: "album artists",
    searchLabel: "Search album artists",
    searchPlaceholder: "Search album artists…",
  };

  const { library } = useApp();
  const view = library.views.albumArtists;
  const catalog = new LibraryCatalog(library.catalog, () => view.request, library.state);
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/album-artists"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  sort={view}
  {catalog}
  skip={view.skip}
  onjump={view.jumpTo}
>
  {#snippet content(artists, scroll)}
    <VirtualMediaGrid
      items={artists}
      itemKey={(artist) => artist.id}
      artworkAt={(index) => artists[index]?.artwork}
      sortSignature={view.sortSignature}
      ontopindexchange={scroll.ontopindexchange}
    >
      {#snippet tile(artist)}
        <ArtistTile {artist} />
      {/snippet}
    </VirtualMediaGrid>
  {/snippet}
</LibraryWorkspace>
