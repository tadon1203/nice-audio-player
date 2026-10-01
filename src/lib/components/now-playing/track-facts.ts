import { albumArtistHref, albumHref } from "$lib/library/routes";
import type { LyricsResolution, PlaybackItem } from "$lib/native";

/** Artist and album as shown, each with the page it links to (null when it has none). */
export function trackLinks(item: PlaybackItem): {
  artist: { text: string; href: string | null } | null;
  album: { text: string; href: string | null } | null;
} {
  const album = item.album?.trim() ?? "";
  const artist = item.artist?.trim() ?? "";
  // The catalog's own key, so the link cannot drift from how the library groups albums.
  const albumArtist = item.albumKey?.albumArtist || item.albumArtist?.trim() || artist;
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
            href:
              item.albumKey === null
                ? null
                : albumHref(item.albumKey.albumArtist, item.albumKey.title),
          },
  };
}

/**
 * `2019  Disc 2  Track 4 of 12  FLAC 24/96`: what the library knows, then what is really decoded
 * (`source`, from the signal path). A first disc is not mentioned.
 */
export function trackFacts(
  item: PlaybackItem,
  source: string | null | undefined,
): (string | number | null | undefined)[] {
  return [
    item.year,
    item.discNumber !== null && item.discNumber > 1 ? `Disc ${item.discNumber}` : null,
    item.trackNumber !== null
      ? item.albumTrackCount !== null && item.albumTrackCount >= item.trackNumber
        ? `Track ${item.trackNumber} of ${item.albumTrackCount}`
        : `Track ${item.trackNumber}`
      : null,
    source,
  ];
}

/** Where a sidecar `.lrc` for this file would be. */
export function expectedLyricsPath(filePath: string): string {
  return filePath.replace(/\.[^.\\/]+$/, ".lrc");
}

/** Why the right column shows no timed lyrics, said in the Facts line rather than the column. */
export type LyricsState =
  | { kind: "none" }
  | { kind: "notFound" }
  | { kind: "sourceFailed"; expectedPath: string }
  | { kind: "embedded" }
  | { kind: "unsynced" };

export function lyricsState(
  item: PlaybackItem,
  resolution: LyricsResolution | null | undefined,
): LyricsState {
  if (resolution === null || resolution === undefined) return { kind: "none" };
  if (resolution.status === "notFound") return { kind: "notFound" };
  if (resolution.status === "sourceFailed") {
    return { kind: "sourceFailed", expectedPath: expectedLyricsPath(item.file.path) };
  }
  if (resolution.notice === "sidecarFailedUsingEmbedded") return { kind: "embedded" };
  return resolution.document.content.kind === "plain" ? { kind: "unsynced" } : { kind: "none" };
}
