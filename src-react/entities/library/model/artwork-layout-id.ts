import type { LibraryAlbumKey } from "@/shared/ipc";

/**
 * Shared-element ids for library artwork: a tile and the header of its details page use the
 * same id, so the artwork moves between them instead of being redrawn.
 */
export const albumArtworkLayoutId = (key: LibraryAlbumKey) =>
  `album-artwork:${key.albumArtist}\u0000${key.title}`;

export const artistArtworkLayoutId = (name: string) => `artist-artwork:${name}`;
