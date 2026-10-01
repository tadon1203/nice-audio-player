import { toNameSegment } from "./unknown-name";

/*
 * Library URLs, in one place. Plain strings rather than `resolve()`, so every caller (links,
 * `goto`, the track menu) shares this one spelling of a name segment.
 */

const segment = (name: string) => encodeURIComponent(toNameSegment(name));

export const albumHref = (albumArtist: string, albumTitle: string) =>
  `/library/albums/${segment(albumArtist)}/${segment(albumTitle)}`;

export const albumArtistHref = (name: string) => `/library/album-artists/${segment(name)}`;
