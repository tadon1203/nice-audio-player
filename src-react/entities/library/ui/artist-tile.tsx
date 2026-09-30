import { Link } from "@tanstack/react-router";
import { FactLine } from "@/shared/ui/fact-line";
import type { LibraryAlbumArtistSummary } from "@/shared/ipc";
import { formatCount } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { SharedArtwork } from "@/shared/ui/shared-artwork";
import { artistArtworkLayoutId } from "../model/artwork-layout-id";
import { artistNameLabel, toNameSegment } from "../model/unknown-name";

export function ArtistTile({
  artist,
  className,
}: {
  artist: LibraryAlbumArtistSummary;
  className?: string;
}) {
  const name = artistNameLabel(artist.key.name);
  return (
    <Link
      to="/library/album-artists/$artistName"
      params={{ artistName: toNameSegment(artist.key.name) }}
      state={{ artwork: artist.artwork }}
      aria-label={`Browse albums by ${name}`}
      className={cn(
        "group block min-w-0 rounded-lg text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <SharedArtwork
        layoutId={artistArtworkLayoutId(artist.key.name)}
        artwork={artist.artwork}
        alt={`${name} artwork`}
        round
        imageClassName="transition-transform group-hover:scale-[1.04]"
      />
      <p className="mt-3 truncate text-sm font-medium text-foreground" title={name}>
        {name}
      </p>
      <FactLine
        className="mt-1"
        facts={[formatCount(artist.albumCount, "album"), formatCount(artist.trackCount, "track")]}
      />
    </Link>
  );
}
