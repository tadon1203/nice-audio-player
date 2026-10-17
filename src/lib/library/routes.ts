import type { LibraryAlbumKey } from "#lib/native";
import { toNameSegment } from "./unknown-name";

/*
 * Library URLs, in one place. Plain strings rather than `resolve()`, so every caller (links,
 * `goto`, the track menu) shares this one spelling of a name segment.
 */

const segment = (name: string) => encodeURIComponent(toNameSegment(name));

/**
 * The albumEdition (which printing of the album) travels as a query, since it is a folder path.
 * `fromArtist` marks an album opened from an Album Artist's page, so its Back link returns there.
 * It is in the URL, not in history state, so it survives a reload.
 */
export const albumHref = (key: LibraryAlbumKey, fromArtist = false) => {
  const query = [
    key.albumEdition === "" ? null : `albumEdition=${encodeURIComponent(key.albumEdition)}`,
    fromArtist ? "from=artist" : null,
  ].filter((part) => part !== null);
  return (
    `/library/albums/${segment(key.albumArtist)}/${segment(key.title)}` +
    (query.length === 0 ? "" : `?${query.join("&")}`)
  );
};

/** The albumEdition an album URL names; none is the album of tracks without one. */
export const albumEditionOf = (search: Pick<URLSearchParams, "get">) =>
  search.get("albumEdition") ?? "";

/** Whether an album URL says it was opened from an Album Artist's page. */
export const albumFromArtist = (search: Pick<URLSearchParams, "get">) =>
  search.get("from") === "artist";

export const albumArtistHref = (name: string) => `/library/album-artists/${segment(name)}`;
