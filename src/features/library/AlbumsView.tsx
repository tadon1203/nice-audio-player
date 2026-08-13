import { useEffect, useRef } from "react";
import type { LibraryAlbumSummary } from "@/bindings";
import { AlbumCard } from "./AlbumCard";

export function AlbumsView({
  albums,
  hasMore,
  onEnd,
}: {
  albums: LibraryAlbumSummary[];
  hasMore: boolean;
  onEnd: () => void;
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
    <section>
      <h2>Albums</h2>
      <div className="library-view__album-grid">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
    </section>
  );
}
