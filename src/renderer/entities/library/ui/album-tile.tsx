import { Link } from "@tanstack/react-router";
import { PlayPauseIcon } from "@/renderer/shared/ui/play-pause-icon";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import type { LibraryAlbumSummary } from "@/shared/ipc";
import { MISSING } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { SharedArtwork } from "@/renderer/shared/ui/shared-artwork";
import { albumArtworkLayoutId } from "../model/artwork-layout-id";
import { albumTitleLabel, artistNameLabel, toNameSegment } from "../model/unknown-name";

/** An artwork-led album entry. Titles are not headings: tiles belong to a list. */
export function AlbumTile({
  album,
  showArtist = true,
  parentArtist,
  onPlay,
  className,
}: {
  album: LibraryAlbumSummary;
  /** Shows the album artist; omit it where the surrounding view already names the artist. */
  showArtist?: boolean;
  /** The artist view this tile was opened from, so the album can return there. */
  parentArtist?: string;
  /** Starts the album; the tile shows a play button on hover and focus when given. */
  onPlay?: (album: LibraryAlbumSummary) => void;
  className?: string;
}) {
  const title = albumTitleLabel(album.key.title);
  const artist = artistNameLabel(album.key.albumArtist);
  return (
    <div className={cn("group/tile relative min-w-0", className)}>
      <Link
        to="/library/albums/$albumArtist/$albumTitle"
        params={{
          albumArtist: toNameSegment(album.key.albumArtist),
          albumTitle: toNameSegment(album.key.title),
        }}
        state={{ artwork: album.artwork, ...(parentArtist === undefined ? {} : { parentArtist }) }}
        aria-label={showArtist ? `Open album ${title} by ${artist}` : `Open album ${title}`}
        className="group block min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SharedArtwork
          layoutId={albumArtworkLayoutId(album.key)}
          artwork={album.artwork}
          alt={`${title} artwork`}
          imageClassName="transition-transform group-hover:scale-[1.04]"
        />
        <div className="mt-3 min-w-0">
          <p className="truncate text-sm font-medium text-foreground" title={title}>
            {title}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            {showArtist ? (
              <span className="min-w-0 flex-1 truncate" title={artist}>
                {artist}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <span className="shrink-0 tabular-nums">{album.year ?? MISSING}</span>
          </div>
        </div>
      </Link>
      {/* Beside the link, not inside it: the tile opens the album, this starts it. */}
      {onPlay ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
          <Button
            type="button"
            size="icon-lg"
            className="pointer-events-auto absolute right-2 bottom-2 rounded-full opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            aria-label={`Play ${title}`}
            onClick={() => onPlay(album)}
          >
            <PlayPauseIcon playing={false} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
