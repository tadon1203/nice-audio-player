import type { LibraryTrackSummary } from "#lib/native";
import { albumArtistHref, albumHref } from "./routes";

type Link = { text: string; href: string | null };

/** What a track needs to say where its artist and album live. */
type TrackLinkSource = Partial<
  Pick<LibraryTrackSummary, "album" | "artist" | "albumArtist" | "albumKey">
>;

/** Rules about a track as a row: its links and whether it can be used. */
export class Tracks {
  /**
   * Artist and album as shown, each with the page it links to (null when it has none). The album
   * link is built from the catalog's own key, so it cannot drift from how the library files the
   * track; the table, the dock and Now Playing all read their links from here.
   */
  public static links(track: TrackLinkSource): { artist: Link | null; album: Link | null } {
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
  public static isFilePresent(track: Pick<LibraryTrackSummary, "availability">): boolean {
    return track.availability === "available";
  }

  /** Whether the track can be played or queued now. */
  public static isAvailable(
    track: Pick<LibraryTrackSummary, "playable" | "availability">,
  ): boolean {
    return track.playable && Tracks.isFilePresent(track);
  }
}
