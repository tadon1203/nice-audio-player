import type { LibrarySortDirection, LibraryTrackSortKey, PlaybackContext } from "$lib/native";

/** A track list's filter and sort: what the backend needs to rebuild the same list. */
export type TrackListView = {
  filter: string;
  sortKey: LibraryTrackSortKey;
  direction: LibrarySortDirection;
};

/** The playback context that plays the tracks list as it is currently filtered and sorted. */
export function trackListContext(view: TrackListView): PlaybackContext {
  return {
    kind: "tracks",
    search: view.filter === "" ? null : view.filter,
    sortKey: view.sortKey,
    sortDirection: view.direction,
  };
}
