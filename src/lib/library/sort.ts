import {
  type ArtistSortKey,
  type AlbumSortKey,
  type ArtistAlbumSortKey,
  type LetterIndexEntry,
  type SortDirection,
  type TrackSortKey,
} from "#lib/native/bindings";
import type { SortOption } from "#lib/components/ui/sort-option";

/**
 * Derives the ordered keys, select options, and type guard for one sort-key set
 * from a label record. Typing the record by the generated key union makes a key
 * added to or removed from the backend a compile error here.
 */
function defineSortKeys<Key extends string>(
  labels: Readonly<Record<Key, string>>,
): {
  keys: [Key, ...Key[]];
  options: readonly SortOption<Key>[];
  isKey: (value: string) => value is Key;
} {
  const keys = Object.keys(labels) as [Key, ...Key[]];
  const options: readonly SortOption<Key>[] = keys.map((key) => ({ key, label: labels[key] }));
  const isKey = (value: string): value is Key => Object.hasOwn(labels, value);
  return { keys, options, isKey };
}

const albums = defineSortKeys<AlbumSortKey>({
  title: "Album title",
  artist: "Album artist",
  year: "Year",
});

const albumArtists = defineSortKeys<ArtistSortKey>({
  artist: "Artist",
  albumCount: "Album count",
  trackCount: "Track count",
});

const artistAlbums = defineSortKeys<ArtistAlbumSortKey>({
  year: "Year",
  title: "Title",
});

/** Track sorting is driven by table headers, so the labels double as column titles. */
const trackSortLabels = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  duration: "Time",
} as const satisfies Record<TrackSortKey, string>;

const tracks = defineSortKeys<TrackSortKey>(trackSortLabels);

/** The sort keys and options of each presentation, and the direction rule. */
export class Sort {
  public static readonly albumKeys = albums.keys;
  public static readonly albumOptions = albums.options;
  public static readonly albumArtistOptions = albumArtists.options;
  public static readonly artistAlbumOptions = artistAlbums.options;
  public static readonly trackKeys = tracks.keys;
  public static readonly trackOptions = tracks.options;
  /** The column titles of the track table, by sort key. */
  public static readonly trackLabels = trackSortLabels;

  public static isAlbumKey(value: string): value is AlbumSortKey {
    return albums.isKey(value);
  }

  public static isTrackKey(value: string): value is TrackSortKey {
    return tracks.isKey(value);
  }

  public static toggleDirection(direction: SortDirection): SortDirection {
    return direction === "ascending" ? "descending" : "ascending";
  }
}

/**
 * The label a list position is filed under, read from the list's own letter index, so it can never
 * disagree with the order. `null` past the end or when the list has no index.
 */
export function labelAt(entries: readonly LetterIndexEntry[], position: number): string | null {
  let start = 0;
  for (const entry of entries) {
    if (position < start + entry.count) return entry.label;
    start += entry.count;
  }
  return null;
}

/** The row a label's entry starts at; `null` when there is no such label. */
export function skipTo(entries: readonly LetterIndexEntry[], label: string): number | null {
  return entries.find((entry) => entry.label === label)?.start ?? null;
}
