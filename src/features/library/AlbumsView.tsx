import { useEffect, useRef } from "react";
import type { LibraryAlbumSummary } from "@/bindings";
import { AlbumCard } from "./AlbumCard";

export function AlbumsView({
  albums,
  hasMore,
  onEnd,
  onOpen,
}: {
  albums: LibraryAlbumSummary[];
  hasMore: boolean;
  onEnd: () => void;
  onOpen: (album: LibraryAlbumSummary) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onEnd();
      },
      { root: document.querySelector(".app-shell__main") },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onEnd]);
  return (
    <section className="library-view__album-section" aria-label="Albums">
      <div className="library-view__album-grid">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} onOpen={onOpen} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
    </section>
  );
}
