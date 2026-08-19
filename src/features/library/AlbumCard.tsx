import { useLayoutEffect, useRef } from "react";
import type { LibraryAlbumSummary } from "@/bindings";
import { LibraryArtwork } from "./LibraryArtwork";
import { AlbumArtworkIdentity } from "./AlbumArtworkIdentity";

export function AlbumCard({
  album,
  onOpen,
  returnFocus = false,
  onReturnFocusRestored = () => undefined,
}: {
  album: LibraryAlbumSummary;
  onOpen: (album: LibraryAlbumSummary) => void;
  returnFocus?: boolean;
  onReturnFocusRestored?: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!returnFocus) return;
    buttonRef.current?.focus({ preventScroll: true });
    onReturnFocusRestored();
  }, [onReturnFocusRestored, returnFocus]);
  return (
    <article className="library-view__album">
      <button
        ref={buttonRef}
        type="button"
        className="library-view__album-button"
        data-album-id={album.id}
        aria-label={`Open ${album.title} by ${album.albumArtist}`}
        onClick={() => onOpen(album)}
      >
        <AlbumArtworkIdentity
          albumId={album.id}
          className="album-artwork-identity library-view__album-artwork-frame"
        >
          <LibraryArtwork artwork={album.artwork} />
        </AlbumArtworkIdentity>
        <span className="library-view__album-title">{album.title}</span>
        <span className="library-view__album-artist">{album.albumArtist}</span>
      </button>
    </article>
  );
}
