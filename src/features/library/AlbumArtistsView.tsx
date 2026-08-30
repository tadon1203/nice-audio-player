import { useEffect, useRef } from "react";
import type { LibraryAlbumArtistSummary, LibraryAlbumSummary } from "@/bindings";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/button";
import {
  albumDetailArtworkClass,
  albumDetailContentClass,
  albumDetailHeroClass,
  albumDetailIdentityClass,
} from "./album-detail-layout";
import { LibraryArtwork } from "./LibraryArtwork";
import { AlbumCard } from "./AlbumCard";
import { AlbumArtistCard } from "./AlbumArtistCard";
import type { useAlbumArtistQuery } from "./use-album-artist-query";
import type { PagedLibraryQueryResult } from "./use-paged-library-query";
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
    <section aria-label="Album artists">
      <div
        data-region="album-grid"
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,210px))] gap-x-5 gap-y-10"
      >
        {items.map((artist) => (
          <AlbumArtistCard key={artist.key.name} artist={artist} onOpen={onSelectArtist} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      {query.error ? (
        <div className="my-12 max-w-[70ch] text-error" role="alert">
          <p>{formatLibraryQueryError(query.error, "album artists")}</p>
          <Button type="button" onClick={() => void query.retry()}>
            Retry album artists
          </Button>
        </div>
      ) : null}
      {loading && items.length === 0 ? (
        <p className="my-12 text-text-secondary">Loading album artists…</p>
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
      className="relative isolate box-border w-full px-[var(--layout-inline-padding)] py-6 pb-[60px]"
      aria-label={`${artist?.key.name ?? artistKey.name} album artist detail`}
    >
      <div className={albumDetailContentClass}>
        <button
          type="button"
          className="min-h-10 border-0 bg-transparent p-0 text-text-secondary hover:text-text-primary"
          onClick={onBack}
        >
          <AppIcon name="chevronLeft" /> <span>Back</span>
        </button>
        <div className={albumDetailHeroClass} data-region="album-detail-content">
          {artist ? (
            <span data-region="album-detail-artwork" className={albumDetailArtworkClass}>
              <LibraryArtwork artwork={artist.artwork} />
            </span>
          ) : null}
          <div data-region="album-detail-identity" className={albumDetailIdentityClass}>
            <h1 className="text-media-title-interface font-semibold leading-media-title-interface">
              {artist?.key.name ?? artistKey.name}
            </h1>
            {artist ? (
              <p className="min-h-6 text-body-sm text-text-secondary">
                {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
              </p>
            ) : null}
          </div>
        </div>
        {summaryError ? (
          <div className="my-12 text-error" role="alert">
            <p>{summaryError}</p>
            <Button type="button" onClick={() => void onRetrySummary()}>
              Retry album artist
            </Button>
          </div>
        ) : summaryLoading && !artist ? (
          <p className="my-12 text-text-secondary">Loading album artist…</p>
        ) : (
          <div
            data-region="album-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(200px,210px))] gap-x-5 gap-y-10"
          >
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
          <div className="my-12 text-error" role="alert">
            <p>{formatLibraryQueryError(query.error, "albums")}</p>
            <Button type="button" onClick={() => void query.retry()}>
              Retry artist albums
            </Button>
          </div>
        ) : null}
        {query.loading && query.items.length === 0 ? (
          <p className="my-12 text-text-secondary">Loading artist albums…</p>
        ) : null}
      </div>
    </section>
  );
}
