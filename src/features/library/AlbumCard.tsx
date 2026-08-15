import type { LibraryAlbumSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";

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
        data-album-id={album.id}
        aria-label={`Open ${album.title} by ${album.albumArtist}`}
        onClick={() => onOpen(album)}
      >
        <span className="library-view__album-artwork-frame">
          <LibraryArtwork artwork={album.artwork} />
        </span>
        <span className="library-view__album-title">{album.title}</span>
        <span className="library-view__album-artist">{album.albumArtist}</span>
      </button>
    </article>
  );
}
