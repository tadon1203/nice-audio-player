import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "#lib/native";
import type { SortOption } from "#lib/ui/sort-option";

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

const albums = defineSortKeys<LibraryAlbumSortKey>({
  title: "Album title",
  artist: "Album artist",
  year: "Year",
});

const albumArtists = defineSortKeys<LibraryAlbumArtistSortKey>({
  artist: "Artist",
  albumCount: "Album count",
  trackCount: "Track count",
});

const artistAlbums = defineSortKeys<LibraryArtistAlbumSortKey>({
  year: "Year",
  title: "Title",
});

/** Track sorting is driven by table headers, so the labels double as column titles. */
const trackSortLabels = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  duration: "Time",
} as const satisfies Record<LibraryTrackSortKey, string>;

const tracks = defineSortKeys<LibraryTrackSortKey>(trackSortLabels);

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

  public static isAlbumKey(value: string): value is LibraryAlbumSortKey {
    return albums.isKey(value);
  }

  public static isTrackKey(value: string): value is LibraryTrackSortKey {
    return tracks.isKey(value);
  }

  public static toggleDirection(direction: LibrarySortDirection): LibrarySortDirection {
    return direction === "ascending" ? "descending" : "ascending";
  }
}
