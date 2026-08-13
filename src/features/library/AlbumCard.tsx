import type { LibraryAlbumSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";

export function AlbumCard({ album }: { album: LibraryAlbumSummary }) {
  return (
    <article className="library-view__album">
      <LibraryArtwork artwork={album.artwork} />
      <h3>{album.title}</h3>
      <p>{album.albumArtist}</p>
    </article>
  );
}
