import { resolve } from "$app/paths";
import type { LibraryTrackSummary } from "#lib/native";

type Link = { text: string; href: string | null };

/** What a track needs to say where its artist and album live. */
type TrackLinkSource = Partial<
  Pick<LibraryTrackSummary, "album" | "artist" | "albumId" | "albumArtistId">
>;

/** Rules about a track as a row: its links and whether it can be used. */
export class Tracks {
  /**
   * Artist and album as shown, each with the page it links to (null when it has none). The links
   * are built from the track's IDs, so a track without an ID has no link; the table, the dock and
   * Now Playing all read their links from here.
   */
  public static links(track: TrackLinkSource): { artist: Link | null; album: Link | null } {
    const album = track.album?.trim() ?? "";
    const artist = track.artist?.trim() ?? "";
    const albumId = track.albumId ?? null;
    const albumArtistId = track.albumArtistId ?? null;
    return {
      artist:
        artist === ""
          ? null
          : {
              text: artist,
              href:
                albumArtistId === null
                  ? null
                  : resolve("/library/album-artists/[artistId=artistId]", {
                      artistId: albumArtistId,
                    }),
            },
      album:
        album === ""
          ? null
          : {
              text: album,
              href:
                albumId === null ? null : resolve("/library/albums/[albumId=albumId]", { albumId }),
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
