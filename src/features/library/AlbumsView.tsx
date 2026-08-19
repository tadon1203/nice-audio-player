import { useEffect, useRef } from "react";
import type { LibraryAlbumSummary } from "@/bindings";
import { AlbumCard } from "./AlbumCard";

export function AlbumsView({
  albums,
  hasMore,
  onEnd,
  onOpen,
  scrollRoot,
  returnFocusAlbumId,
  onReturnFocusRestored,
}: {
  albums: LibraryAlbumSummary[];
  hasMore: boolean;
  onEnd: () => void;
  onOpen: (album: LibraryAlbumSummary) => void;
  scrollRoot: HTMLElement | null;
  returnFocusAlbumId: string | null;
  onReturnFocusRestored: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onEnd();
      },
      { root: scrollRoot },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onEnd, scrollRoot]);
  return (
    <section className="library-view__album-section" aria-label="Albums">
      <div className="library-view__album-grid">
        {albums.map((album) => (
          <AlbumCard
            key={album.id}
            album={album}
            onOpen={onOpen}
            returnFocus={returnFocusAlbumId === album.id}
            onReturnFocusRestored={onReturnFocusRestored}
          />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
    </section>
  );
}
