import { toNameSegment } from "./unknown-name";

/*
 * Library URLs, in one place. Plain strings rather than `resolve()`: the album detail route is
 * typed only once it exists (ticket 08), and every caller shares this one spelling.
 */

const segment = (name: string) => encodeURIComponent(toNameSegment(name));

export const albumHref = (albumArtist: string, albumTitle: string) =>
  `/library/albums/${segment(albumArtist)}/${segment(albumTitle)}`;

export const albumArtistHref = (name: string) => `/library/album-artists/${segment(name)}`;
