import type { LibraryAlbumArtistKey, LibraryAlbumKey } from "@/bindings";

function encodeIdentity(value: object) {
  return encodeURIComponent(JSON.stringify(value));
}
export function albumIdentity(key: LibraryAlbumKey) {
  return `album:${encodeIdentity(key)}`;
}
export function albumArtistIdentity(key: LibraryAlbumArtistKey) {
  return `artist:${encodeIdentity(key)}`;
}
