import type { LibraryAlbumKey } from "$lib/native";
import { toNameSegment } from "./unknown-name";

/*
 * Library URLs, in one place. Plain strings rather than `resolve()`, so every caller (links,
 * `goto`, the track menu) shares this one spelling of a name segment.
 */

const segment = (name: string) => encodeURIComponent(toNameSegment(name));

/** The albumEdition (which printing of the album) travels as a query, since it is a folder path. */
export const albumHref = (key: LibraryAlbumKey) =>
  `/library/albums/${segment(key.albumArtist)}/${segment(key.title)}` +
  (key.albumEdition === "" ? "" : `?albumEdition=${encodeURIComponent(key.albumEdition)}`);

/** The albumEdition an album URL names; none is the album of tracks without one. */
export const albumEditionOf = (search: URLSearchParams) => search.get("albumEdition") ?? "";

export const albumArtistHref = (name: string) => `/library/album-artists/${segment(name)}`;
