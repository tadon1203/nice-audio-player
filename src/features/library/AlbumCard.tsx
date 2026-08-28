import type { LibraryAlbumSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";
import { AlbumArtworkIdentity } from "./AlbumArtworkIdentity";
import { albumIdentity } from "./library-identity";

export function AlbumCard({
  album,
  onOpen,
}: {
  album: LibraryAlbumSummary;
  onOpen: (album: LibraryAlbumSummary) => void;
}) {
  return (
    <article className="library-view__album">
      <button
        type="button"
        className="library-view__album-button"
        data-album-key={JSON.stringify(album.key)}
        data-library-focus-id={albumIdentity(album.key)}
        aria-label={`Open ${album.key.title} by ${album.key.albumArtist}`}
        onClick={() => onOpen(album)}
      >
        <AlbumArtworkIdentity
          albumId={album.key}
          className="album-artwork-identity library-view__album-artwork-frame"
        >
          <LibraryArtwork artwork={album.artwork} />
        </AlbumArtworkIdentity>
        <span className="library-view__album-title">{album.key.title}</span>
        <span className="library-view__album-artist">{album.key.albumArtist}</span>
      </button>
    </article>
  );
}
