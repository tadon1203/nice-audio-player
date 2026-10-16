<script lang="ts">
  import TrackTable from "#lib/components/track-table/track-table.svelte";
  import { LibraryCatalog } from "#lib/library/library-catalog.svelte";
  import { TrackList } from "#lib/library/track-list";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Tracks",
    singular: "track",
    plural: "tracks",
    searchLabel: "Search tracks",
    searchPlaceholder: "Search tracks…",
  };

  const services = AppServices.current();
  const { playback, actions, libraryViews } = services;
  const view = libraryViews.tracks;
  const catalog = new LibraryCatalog(services.catalog, () => view.request);
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/tracks"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  {catalog}
  skip={view.skip}
  onjump={view.jumpTo}
>
  {#snippet content(tracks, scroll)}
    <TrackTable
      rows={tracks}
      caption="Library tracks"
      scrollElement={scroll.viewport}
      ontopindexchange={scroll.ontopindexchange}
      sortKey={view.sortKey}
      sortDirection={view.direction}
      onsortchange={(key, direction) => view.setSort(key, direction)}
      onplaytrack={(id) =>
        actions.run(() => playback.start(TrackList.context(catalog.request), id))}
    />
  {/snippet}
</LibraryWorkspace>
