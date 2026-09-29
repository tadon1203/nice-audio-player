import { Link } from "@tanstack/react-router";
import type { LibraryAlbumSummary } from "@/shared/ipc";
import { MISSING } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { albumTitleLabel, artistNameLabel, toNameSegment } from "../model/unknown-name";

/** An artwork-led album entry. Titles are not headings: tiles belong to a list. */
export function AlbumTile({
  album,
  showArtist = true,
  parentArtist,
  className,
}: {
  album: LibraryAlbumSummary;
  /** Shows the album artist; omit it where the surrounding view already names the artist. */
  showArtist?: boolean;
  /** The artist view this tile was opened from, so the album can return there. */
  parentArtist?: string;
  className?: string;
}) {
  const title = albumTitleLabel(album.key.title);
  const artist = artistNameLabel(album.key.albumArtist);
  return (
    <Link
      to="/library/albums/$albumArtist/$albumTitle"
      params={{
        albumArtist: toNameSegment(album.key.albumArtist),
        albumTitle: toNameSegment(album.key.title),
      }}
      state={parentArtist === undefined ? undefined : { parentArtist }}
      aria-label={showArtist ? `Open album ${title} by ${artist}` : `Open album ${title}`}
      className={cn(
        "group block min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Artwork
        artwork={album.artwork}
        alt={`${title} artwork`}
        className="w-full transition-transform group-hover:scale-[1.02]"
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
  );
}
