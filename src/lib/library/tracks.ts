import { resolve } from "$app/paths";
import { type TrackRow } from "#lib/native/bindings";

interface Link {
  text: string;
  href: string | null;
}

/** What a track needs to say where its artist and album live. */
type TrackLinkSource = Partial<Pick<TrackRow, "artist" | "album">>;

/** Rules about a track as a row: its links and whether it can be used. */
export class Tracks {
  /**
   * Artist and album as shown, each with the page it links to (null when it has none). The links
   * are built from the track's album, so a track without one has no link; the table, the dock and
   * Now Playing all read their links from here.
   */
  public static links(track: TrackLinkSource): { artist: Link | null; album: Link | null } {
    const album = track.album ?? null;
    const albumTitle = album?.title.trim() ?? "";
    const artist = track.artist?.trim() ?? "";
    return {
      artist:
        artist === ""
          ? null
          : {
              text: artist,
              href:
                album === null
                  ? null
                  : resolve("/library/album-artists/[artistId=artistId]", {
                      artistId: album.artist.id,
                    }),
            },
      album:
        album === null || albumTitle === ""
          ? null
          : {
              text: albumTitle,
              href: resolve("/library/albums/[albumId=albumId]", { albumId: album.id }),
            },
    };
  }

  /** Whether the file is on disk (it can be shown in Explorer). */
  public static isFilePresent(track: Pick<TrackRow, "state">): boolean {
    return track.state !== "missing";
  }

  /** Whether the track can be played or queued now. */
  public static isPlayable(track: Pick<TrackRow, "state">): boolean {
    return track.state === "playable";
  }
}
