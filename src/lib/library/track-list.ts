import type {
  LibrarySortDirection,
  LibraryTrackSortKey,
  LibraryTrackSummary,
  PlaybackContext,
} from "$lib/native";
import { sortIndexLetter } from "$lib/utils/sort-index";

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

/** The letter shown while scrolling a track list; none when the sort has no letters (duration). */
export function trackIndexKey(
  track: Pick<LibraryTrackSummary, "title" | "artist" | "album">,
  sortKey: LibraryTrackSortKey,
): string | null {
  switch (sortKey) {
    case "duration":
      return null;
    case "artist":
      return sortIndexLetter(track.artist ?? "");
    case "album":
      return sortIndexLetter(track.album ?? "");
    case "title":
      return sortIndexLetter(track.title);
  }
}
