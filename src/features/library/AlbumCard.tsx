import type { LibraryAlbumSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";
import { albumIdentity } from "./library-identity";

export function AlbumCard({
  album,
  onOpen,
}: {
  album: LibraryAlbumSummary;
  onOpen: (album: LibraryAlbumSummary) => void;
}) {
  return (
    <article className="min-w-0">
      <button
        type="button"
        className="group block min-h-10 w-full border-0 bg-transparent p-0 text-start text-text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring hover:bg-transparent"
        data-album-key={JSON.stringify(album.key)}
        data-library-focus-id={albumIdentity(album.key)}
        aria-label={`Open ${album.key.title} by ${album.key.albumArtist}`}
        onClick={() => onOpen(album)}
      >
        <span
          data-slot="album-card-artwork"
          className="block aspect-square w-full overflow-hidden rounded-media outline-1 outline-transparent transition-[outline-color] group-hover:outline-border-subtle group-active:outline-border-control"
        >
          <LibraryArtwork artwork={album.artwork} />
        </span>
        <span className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-body-md font-medium text-text-primary">
          {album.key.title}
        </span>
        <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-body-sm text-text-secondary">
          {album.key.albumArtist}
        </span>
      </button>
    </article>
  );
}
