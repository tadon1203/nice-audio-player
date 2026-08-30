import type { LibraryAlbumArtistSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";
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
      className="group block min-h-10 w-full border-0 bg-transparent p-0 text-start text-text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring hover:bg-transparent"
      data-library-focus-id={albumArtistIdentity(artist.key)}
      onClick={() => onOpen(artist)}
      aria-label={`Open ${artist.key.name}`}
    >
      <span
        data-slot="album-card-artwork"
        className="block aspect-square w-full overflow-hidden rounded-media outline-1 outline-transparent transition-[outline-color] group-hover:outline-border-subtle group-active:outline-border-control"
      >
        <LibraryArtwork artwork={artist.artwork} />
      </span>
      <span className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-body-md font-medium text-text-primary">
        {artist.key.name}
      </span>
      <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-body-sm text-text-secondary">
        {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
      </span>
    </button>
  );
}
