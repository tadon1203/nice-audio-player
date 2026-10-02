import type { LibraryAlbumKey } from "$lib/native";

/** A string that names an album by both parts of its key, for lists and element pairing. */
export const albumItemKey = (key: LibraryAlbumKey) => `${key.albumArtist}\u0000${key.title}`;
