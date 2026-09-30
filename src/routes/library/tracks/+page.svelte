<script lang="ts">
  import TrackTable from "$lib/components/track-table/track-table.svelte";
  import { createLibraryCatalog } from "$lib/library/catalog.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { trackIndexKey, trackListContext } from "$lib/library/track-list";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import LibraryWorkspace from "../library-workspace.svelte";

  const meta = {
    title: "Tracks",
    singular: "track",
    plural: "tracks",
    searchLabel: "Search tracks",
    searchPlaceholder: "Search tracks…",
  };

  const view = libraryViews.tracks;
  const catalog = createLibraryCatalog(() => view.request);
  const playback = getPlayback();
</script>

<LibraryWorkspace
  {meta}
  scrollKey="/library/tracks"
  filter={view.filter}
  onfilterchange={view.setFilter}
  stateKey={view.stateKey}
  {catalog}
  indexFor={(track) => trackIndexKey(track, view.sortKey)}
>
  {#snippet content(tracks, scroll)}
    <TrackTable
      rows={tracks}
      caption="Library tracks"
      scrollElement={scroll.viewport}
      initialOffset={scroll.initialOffset}
      ontopindexchange={scroll.ontopindexchange}
      sortKey={view.sortKey}
      sortDirection={view.direction}
      onsortchange={(key, direction) => view.setSort(key, direction)}
      onplaytrack={(id) => void playback.startPlayback(trackListContext(view), id)}
    />
  {/snippet}
</LibraryWorkspace>
