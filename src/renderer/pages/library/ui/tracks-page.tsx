import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { TrackTable } from "@/renderer/widgets/track-table";
import { useLibraryCatalog } from "../model/use-library-catalog";
import { useLibraryView } from "../model/use-library-view";
import { LibraryWorkspace } from "./library-workspace";

const meta = {
  title: "Tracks",
  singular: "track",
  plural: "tracks",
  searchLabel: "Search tracks",
  searchPlaceholder: "Search tracks…",
};

export function TracksPage() {
  const view = useLibraryView("tracks");
  const catalog = useLibraryCatalog(view.request);
  const playbackState = useTrackPlaybackState();
  const playback = usePlaybackActions();

  return (
    <LibraryWorkspace
      meta={meta}
      scrollRestorationId="library-tracks"
      filter={view.filter}
      onFilterChange={(filter) => void view.setFilter(filter)}
      stateKey={view.stateKey}
      catalog={catalog}
    >
      {(tracks, scroll) => (
        <TrackTable
          rows={tracks}
          layout="library"
          caption="Library tracks"
          scrollElement={scroll.viewport}
          initialOffset={scroll.initialOffset}
          activeTrackId={playbackState.activeTrackId}
          playbackStatus={playbackState.playbackStatus}
          sortKey={view.sortKey}
          sortDirection={view.direction}
          onSortChange={(key, direction) => void view.setSort(key, direction)}
          onPlayTrack={playback.startLibraryTrack}
          onPauseActive={playback.pause}
          onResumeActive={playback.resume}
        />
      )}
    </LibraryWorkspace>
  );
}
