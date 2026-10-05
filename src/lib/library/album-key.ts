import type { LibraryAlbumKey } from "$lib/native";

/** A string that names an album by every part of its key, for lists and element pairing. */
export const albumItemKey = (key: LibraryAlbumKey) =>
  `${key.albumArtist}\u0000${key.title}\u0000${key.albumEdition}`;
