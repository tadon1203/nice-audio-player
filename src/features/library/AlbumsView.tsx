import { useEffect, useRef } from "react";
import type { LibraryAlbumSummary } from "@/bindings";
import { AlbumCard } from "./AlbumCard";

export function AlbumsView({
  albums,
  hasMore,
  onEnd,
  onOpen,
  scrollRoot,
}: {
  albums: LibraryAlbumSummary[];
  hasMore: boolean;
  onEnd: () => void;
  onOpen: (album: LibraryAlbumSummary) => void;
  scrollRoot: HTMLElement | null;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || !scrollRoot) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && scrollRoot.scrollTop > 0) onEnd();
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
            key={`${album.key.title}:${album.key.albumArtist}`}
            album={album}
            onOpen={onOpen}
          />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
    </section>
  );
}
