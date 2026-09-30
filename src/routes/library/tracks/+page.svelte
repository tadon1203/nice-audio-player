<script lang="ts">
  import TrackTable from "$lib/components/track-table/track-table.svelte";
  import { createLibraryCatalog } from "$lib/library/catalog.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import { sortIndexLetter } from "$lib/utils/sort-index";
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
  indexFor={view.sortKey === "duration"
    ? undefined
    : (track) =>
        sortIndexLetter(
          (view.sortKey === "artist"
            ? track.artist
            : view.sortKey === "album"
              ? track.album
              : track.title) ?? "",
        )}
>
  {#snippet content(tracks, scroll)}
    <TrackTable
      rows={tracks}
      caption="Library tracks"
      scrollElement={scroll.viewport}
      initialOffset={scroll.initialOffset}
      ontopindexchange={scroll.ontopindexchange}
      activeTrackId={playback.activeTrackId}
      playbackStatus={playback.status}
      sortKey={view.sortKey}
      sortDirection={view.direction}
      onsortchange={(key, direction) => view.setSort(key, direction)}
      onplaytrack={(id) =>
        void playback.startPlayback(
          {
            kind: "tracks",
            search: view.filter === "" ? null : view.filter,
            sortKey: view.sortKey,
            sortDirection: view.direction,
          },
          id,
        )}
      onpauseactive={() => void playback.pause()}
      onresumeactive={() => void playback.resume()}
    />
  {/snippet}
</LibraryWorkspace>
