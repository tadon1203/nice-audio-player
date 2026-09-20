import { Link } from "@tanstack/react-router";
import type { LibraryAlbumArtistSummary } from "@/renderer/entities/library";
import { Artwork } from "@/renderer/shared/ui/artwork";

export function ArtistCard({ artist }: { artist: LibraryAlbumArtistSummary }) {
  return (
    <Link
      to="/library/album-artists/$artistName"
      params={{ artistName: artist.key.name }}
      aria-label={`Browse albums by ${artist.key.name}`}
      className="group min-w-0 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Artwork
        artwork={artist.artwork}
        alt={`${artist.key.name} artwork`}
        className="mx-auto w-full max-w-[220px] rounded-full transition-opacity group-hover:opacity-80"
      />
      <h2 className="mt-3 truncate text-sm font-medium text-foreground">{artist.key.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {artist.albumCount ?? 0} albums · {artist.trackCount ?? 0} tracks
      </p>
    </Link>
  );
}
