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
  useEffect(() => {
    if (!hasMore || !scrollRoot) return;
    const onScroll = () => {
      if (
        scrollRoot.scrollTop > 0 &&
        scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2
      )
        onEnd();
    };
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", onScroll);
  }, [hasMore, onEnd, scrollRoot]);
  return (
    <section aria-label="Albums">
      <div
        data-region="album-grid"
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,210px))] gap-x-5 gap-y-10"
      >
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
