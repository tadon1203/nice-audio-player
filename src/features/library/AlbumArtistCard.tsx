import type { LibraryAlbumArtistSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";
import { AlbumArtistArtworkIdentity } from "./AlbumArtistArtworkIdentity";
import { albumArtistIdentity } from "./library-identity";

export function AlbumArtistCard({
  artist,
  onOpen,
}: {
  artist: LibraryAlbumArtistSummary;
  onOpen: (artist: LibraryAlbumArtistSummary) => void;
}) {
  return (
    <button
      type="button"
      className="library-view__album-button"
      data-library-focus-id={albumArtistIdentity(artist.key)}
      onClick={() => onOpen(artist)}
      aria-label={`Open ${artist.key.name}`}
    >
      <AlbumArtistArtworkIdentity
        artistId={artist.key}
        className="album-artwork-identity library-view__album-artwork-frame"
      >
        <LibraryArtwork artwork={artist.artwork} />
      </AlbumArtistArtworkIdentity>
      <span className="library-view__album-title">{artist.key.name}</span>
      <span className="library-view__album-artist">
        {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
      </span>
    </button>
  );
}
