import { type Lyrics, type QueueItem } from "#lib/native/bindings";

/** Why the right column shows no timed lyrics, said in the Facts line rather than the column. */
export type LyricsState =
  | { kind: "none" }
  | { kind: "notFound" }
  | { kind: "sourceFailed"; fileName: string }
  | { kind: "embedded" }
  | { kind: "unsynced" };

/** The Facts line of Now Playing, and the reason the lyrics are missing from it. */
export class TrackFacts {
  /**
   * `2019  Disc 2  Track 4 of 12  FLAC 24/96`: what the library knows, then what is really decoded
   * (`source`, from the signal path). A first disc is not mentioned.
   */
  public static of(
    item: QueueItem,
    source: string | null | undefined,
  ): (string | number | null | undefined)[] {
    return [
      item.year,
      item.discNumber !== null && item.discNumber > 1 ? `Disc ${item.discNumber}` : null,
      item.trackNumber !== null
        ? item.album !== null && item.album.trackCount >= item.trackNumber
          ? `Track ${item.trackNumber} of ${item.album.trackCount}`
          : `Track ${item.trackNumber}`
        : null,
      source,
    ];
  }

  public static lyricsState(lyrics: Lyrics | null | undefined): LyricsState {
    if (lyrics === null || lyrics === undefined) return { kind: "none" };
    if (lyrics.status === "notFound") return { kind: "notFound" };
    if (lyrics.status === "sourceFailed") {
      return { kind: "sourceFailed", fileName: lyrics.sidecarFileName };
    }
    if (lyrics.notice === "sidecarFailedUsingEmbedded") return { kind: "embedded" };
    return lyrics.content.kind === "plain" ? { kind: "unsynced" } : { kind: "none" };
  }
}
