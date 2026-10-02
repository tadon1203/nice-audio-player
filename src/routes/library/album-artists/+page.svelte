<script lang="ts">
  import { createLibraryCatalog } from "$lib/library/catalog.svelte";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import VirtualMediaGrid from "$lib/ui/media-grid/virtual-media-grid.svelte";
  import { sortIndexLetter } from "$lib/utils/sort-index";
  import ArtistTile from "../artist-tile.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Album Artists",
    singular: "album artist",
    plural: "album artists",
    searchLabel: "Search album artists",
    searchPlaceholder: "Search album artists…",
  };

  const view = libraryViews.albumArtists;
  const catalog = createLibraryCatalog(() => view.request);
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/album-artists"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  sort={view}
  {catalog}
  indexFor={view.sortKey === "artist" ? (artist) => sortIndexLetter(artist.key.name) : undefined}
>
  {#snippet content(artists, scroll)}
    <VirtualMediaGrid
      items={artists}
      scrollElement={scroll.viewport}
      itemKey={(artist) => artist.key.name}
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
