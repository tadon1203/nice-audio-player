import { useEffect, useRef } from "react";
import type { LibraryAlbumArtistSummary, LibraryAlbumSummary } from "@/bindings";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import { LibraryArtwork } from "./LibraryArtwork";
import { AlbumCard } from "./AlbumCard";
import { AlbumArtistCard } from "./AlbumArtistCard";
import type { useAlbumArtistQuery } from "./use-album-artist-query";
import type { PagedLibraryQueryResult } from "./use-paged-library-query";
import { AlbumArtistArtworkIdentity } from "./AlbumArtistArtworkIdentity";
import { formatLibraryQueryError } from "./library-query-error";

export function AlbumArtistsView({
  scrollRoot,
  onSelectArtist,
  query,
}: {
  scrollRoot: HTMLElement | null;
  onSelectArtist: (artist: LibraryAlbumArtistSummary) => void;
  query: ReturnType<typeof useAlbumArtistQuery>;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { items, nextCursor, loading, loadNext } = query;
  useEffect(() => {
    if (!sentinel.current || !nextCursor || !scrollRoot) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || scrollRoot.scrollTop <= 0) return;
        void loadNext();
      },
      { root: scrollRoot },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadNext, nextCursor, scrollRoot]);
  return (
    <section className="library-view__album-section" aria-label="Album artists">
      <div className="library-view__album-grid">
        {items.map((artist) => (
          <AlbumArtistCard key={artist.key.name} artist={artist} onOpen={onSelectArtist} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      {query.error ? (
        <div className="library-view__notice library-view__notice--error" role="alert">
          <p>{formatLibraryQueryError(query.error, "album artists")}</p>
          <Button type="button" onClick={() => void query.retry()}>
            Retry album artists
          </Button>
        </div>
      ) : null}
      {loading && items.length === 0 ? (
        <p className="library-view__notice">Loading album artists…</p>
      ) : null}
    </section>
  );
}

export function AlbumArtistDetailView({
  artist,
  artistKey,
  summaryLoading,
  summaryError,
  onRetrySummary,
  scrollRoot,
  onBack,
  onOpenAlbum,
  query,
}: {
  artist: LibraryAlbumArtistSummary | null;
  artistKey: { name: string };
  summaryLoading: boolean;
  summaryError: string | null;
  onRetrySummary: () => Promise<void>;
  scrollRoot: HTMLElement | null;
  onBack: () => void;
  onOpenAlbum: (album: LibraryAlbumSummary) => void;
  query: PagedLibraryQueryResult<LibraryAlbumSummary, string>;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { nextCursor, loadNext } = query;
  useEffect(() => {
    if (!sentinel.current || !nextCursor || !scrollRoot) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && scrollRoot.scrollTop > 0) void loadNext();
      },
      { root: scrollRoot },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadNext, nextCursor, scrollRoot]);
  return (
    <section
      className="album-detail page-frame"
      aria-label={`${artist?.key.name ?? artistKey.name} album artist detail`}
    >
      <div className="album-detail__content content-frame">
        <button type="button" className="album-detail__back" onClick={onBack}>
          <AppIcon name="chevronLeft" /> <span>Back</span>
        </button>
        <div className="album-detail__hero">
          {artist ? (
            <AlbumArtistArtworkIdentity
              artistId={artist.key}
              className="album-artwork-identity album-detail__artwork-wrap"
            >
              <LibraryArtwork artwork={artist.artwork} className="album-detail__artwork" />
            </AlbumArtistArtworkIdentity>
          ) : null}
          <div className="album-detail__identity">
            <h1 className="type-media-title-interface">{artist?.key.name ?? artistKey.name}</h1>
            {artist ? (
              <p className="album-detail__meta">
                {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
              </p>
            ) : null}
          </div>
        </div>
        {summaryError ? (
          <div className="library-view__notice library-view__notice--error" role="alert">
            <p>{summaryError}</p>
            <Button type="button" onClick={() => void onRetrySummary()}>
              Retry album artist
            </Button>
          </div>
        ) : summaryLoading && !artist ? (
          <p className="library-view__notice">Loading album artist…</p>
        ) : (
          <div className="library-view__album-grid">
            {query.items.map((album) => (
              <AlbumCard
                key={`${album.key.title}:${album.key.albumArtist}`}
                album={album}
                onOpen={onOpenAlbum}
              />
            ))}
          </div>
        )}
        <div ref={sentinel} aria-hidden="true" />
        {query.error ? (
          <div className="library-view__notice library-view__notice--error" role="alert">
            <p>{formatLibraryQueryError(query.error, "albums")}</p>
            <Button type="button" onClick={() => void query.retry()}>
              Retry artist albums
            </Button>
          </div>
        ) : null}
        {query.loading && query.items.length === 0 ? (
          <p className="library-view__notice">Loading artist albums…</p>
        ) : null}
      </div>
    </section>
  );
}
