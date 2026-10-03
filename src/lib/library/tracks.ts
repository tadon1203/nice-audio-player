import type { LibraryTrackSummary } from "$lib/native";
import { albumArtistHref, albumHref } from "./routes";

type Link = { text: string; href: string | null };

/** What a track needs to say where its artist and album live. */
type TrackLinkSource = Partial<
  Pick<LibraryTrackSummary, "album" | "artist" | "albumArtist" | "albumKey">
>;

/**
 * Artist and album as shown, each with the page it links to (null when it has none). The album
 * link is built from the catalog's own key, so it cannot drift from how the library files the
 * track; the table, the dock and Now Playing all read their links from here.
 */
export function trackLinks(track: TrackLinkSource): { artist: Link | null; album: Link | null } {
  const album = track.album?.trim() ?? "";
  const artist = track.artist?.trim() ?? "";
  const key = track.albumKey ?? null;
  const albumArtist = key?.albumArtist || track.albumArtist?.trim() || artist;
  return {
    artist:
      artist === ""
        ? null
        : { text: artist, href: albumArtist === "" ? null : albumArtistHref(albumArtist) },
    album:
      album === ""
        ? null
        : {
            text: album,
            href: key === null ? null : albumHref(key),
          },
  };
}

/** Whether the file is on disk (it can be shown in Explorer). */
export function isFilePresent(track: Pick<LibraryTrackSummary, "availability">): boolean {
  return track.availability === "available";
}

/** Whether the track can be played or queued now. */
export function isTrackAvailable(
  track: Pick<LibraryTrackSummary, "playable" | "availability">,
): boolean {
  return track.playable && isFilePresent(track);
}
