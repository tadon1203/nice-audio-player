import { Link } from "@tanstack/react-router";
import type { LibraryAlbumSummary } from "@/renderer/entities/library";
import { Artwork } from "@/renderer/shared/ui/artwork";

export function AlbumCard({ album }: { album: LibraryAlbumSummary }) {
  return (
    <Link
      to="/library/albums/$albumArtist/$albumTitle"
      params={{ albumArtist: album.key.albumArtist, albumTitle: album.key.title }}
      aria-label={`Open album ${album.key.title} by ${album.key.albumArtist}`}
      className="group min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Artwork
        artwork={album.artwork}
        alt={`${album.key.title} artwork`}
        className="size-[188px] transition-opacity group-hover:opacity-80"
      />
      <div className="mt-3 min-w-0">
        <h2 className="truncate text-sm font-medium text-foreground">{album.key.title}</h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">{album.key.albumArtist}</p>
      </div>
    </Link>
  );
}
