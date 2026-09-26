import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "@/shared/ipc";
import type { SortOption } from "@/renderer/shared/components/collection-sort-control";

/**
 * Derives the ordered keys, select options, and type guard for one sort-key set
 * from a label record. Typing the record by the generated key union makes a key
 * added to or removed from the backend a compile error here.
 */
function defineSortKeys<Key extends string>(labels: Readonly<Record<Key, string>>) {
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
export const trackSortLabels = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  duration: "Time",
} as const satisfies Record<LibraryTrackSortKey, string>;

const tracks = defineSortKeys<LibraryTrackSortKey>(trackSortLabels);

export const albumSortKeys = albums.keys;
export const albumSortOptions = albums.options;
export const isAlbumSortKey = albums.isKey;

export const albumArtistSortKeys = albumArtists.keys;
export const albumArtistSortOptions = albumArtists.options;
export const isAlbumArtistSortKey = albumArtists.isKey;

export const artistAlbumSortKeys = artistAlbums.keys;
export const artistAlbumSortOptions = artistAlbums.options;
export const isArtistAlbumSortKey = artistAlbums.isKey;

export const trackSortKeys = tracks.keys;
export const isTrackSortKey = tracks.isKey;

export const sortDirections = defineSortKeys<LibrarySortDirection>({
  ascending: "Ascending",
  descending: "Descending",
}).keys;

export function toggleSortDirection(direction: LibrarySortDirection): LibrarySortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}
