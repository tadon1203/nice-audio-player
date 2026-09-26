import { Link } from "@tanstack/react-router";
import type { LibraryAlbumArtistSummary } from "@/renderer/entities/library";
import { formatCount } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";

export function ArtistCard({
  artist,
  className,
}: {
  artist: LibraryAlbumArtistSummary;
  className?: string;
}) {
  return (
    <Link
      to="/library/album-artists/$artistName"
      params={{ artistName: artist.key.name }}
      aria-label={`Browse albums by ${artist.key.name}`}
      className={cn(
        "group min-w-0 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Artwork
        artwork={artist.artwork}
        alt={`${artist.key.name} artwork`}
        className="mx-auto w-full rounded-full transition-opacity group-hover:opacity-80"
      />
      <h2 className="mt-3 truncate text-sm font-medium text-foreground">{artist.key.name}</h2>
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {formatCount(artist.albumCount, "album")} · {formatCount(artist.trackCount, "track")}
      </p>
    </Link>
  );
}
