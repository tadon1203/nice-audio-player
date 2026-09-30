import { Link } from "@tanstack/react-router";
import { toNameSegment } from "@/entities/library";
import { usePlaybackSignalPath } from "@/features/playback-signal-path";
import type { LyricsResolution, PlaybackItem } from "@/shared/ipc";
import { cn } from "@/shared/lib/utils";
import { FactLine } from "@/shared/ui/fact-line";

const linkClass =
  "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/** Artist and album, each a link to its page (following one closes Now Playing). */
export function TrackLinks({ item }: { item: PlaybackItem | null }) {
  if (item === null) return null;
  const album = item.album?.trim() ?? "";
  const artist = item.artist?.trim() ?? "";
  // The catalog's own key, so the link cannot drift from how the library groups albums.
  const albumArtist = item.albumKey?.albumArtist || item.albumArtist?.trim() || artist;
  return (
    <>
      {artist !== "" ? (
        <p className="truncate text-base text-foreground">
          {albumArtist !== "" ? (
            <Link
              to="/library/album-artists/$artistName"
              params={{ artistName: toNameSegment(albumArtist) }}
              className={linkClass}
            >
              {artist}
            </Link>
          ) : (
            artist
          )}
        </p>
      ) : null}
      {album !== "" ? (
        <p className="truncate text-sm text-foreground [@container(max-height:520px)]:hidden">
          {item.albumKey !== null ? (
            <Link
              to="/library/albums/$albumArtist/$albumTitle"
              params={{
                albumArtist: toNameSegment(item.albumKey.albumArtist),
                albumTitle: toNameSegment(item.albumKey.title),
              }}
              className={linkClass}
            >
              {album}
            </Link>
          ) : (
            album
          )}
        </p>
      ) : null}
    </>
  );
}

/** `2019  Disc 2  Track 4  FLAC 24/96  No lyrics`: what the library knows, what is really decoded, and the lyrics' state. */
export function Facts({
  item,
  resolution,
}: {
  item: PlaybackItem | null;
  resolution: LyricsResolution | null;
}) {
  const path = usePlaybackSignalPath();
  if (item === null) return null;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted-foreground">
      <FactLine
        facts={[
          item.year,
          item.discNumber !== null && item.discNumber > 1 ? `Disc ${item.discNumber}` : null,
          item.trackNumber !== null
            ? item.albumTrackCount !== null && item.albumTrackCount >= item.trackNumber
              ? `Track ${item.trackNumber} of ${item.albumTrackCount}`
              : `Track ${item.trackNumber}`
            : null,
          path?.source,
        ]}
      />
      <LyricsState item={item} resolution={resolution} />
    </div>
  );
}

/** Why the right column shows no timed lyrics, in the Facts line rather than the column. */
function LyricsState({
  item,
  resolution,
}: {
  item: PlaybackItem;
  resolution: LyricsResolution | null;
}) {
  if (resolution === null) return null;
  if (resolution.status === "notFound") return <span>No lyrics</span>;
  if (resolution.status === "sourceFailed") {
    const expected = item.file.path.replace(/\.[^.\\/]+$/, ".lrc");
    return (
      <button
        type="button"
        title={`${expected} (click to copy)`}
        onClick={() => void navigator.clipboard?.writeText(expected).catch(() => undefined)}
        className={cn("cursor-pointer", linkClass)}
      >
        Lyrics file unreadable
      </button>
    );
  }
  if (resolution.notice === "sidecarFailedUsingEmbedded") {
    return <span title="The .lrc file couldn't be read.">Embedded lyrics</span>;
  }
  return resolution.document.content.kind === "plain" ? <span>Unsynced lyrics</span> : null;
}
