import type { SortDirection, TrackSortKey, PlaybackContext } from "#lib/native";

/** A track list's filter and sort: what the backend needs to rebuild the same list. */
export interface TrackListView {
  filter: string;
  sortKey: TrackSortKey;
  direction: SortDirection;
}

/** The tracks list as a playback source. */
export class TrackList {
  /** The playback context that plays the tracks list as it is currently filtered and sorted. */
  public static context(view: TrackListView): PlaybackContext {
    return {
      kind: "tracks",
      search: view.filter === "" ? null : view.filter,
      sortKey: view.sortKey,
      sortDirection: view.direction,
    };
  }
}
