import { useEffect, useMemo, useRef, useState } from "react";
import { getLibraryStatus, listLibraryRoots } from "@/api/library";
import { Button } from "@/components/ui/button";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { useAlbumQuery } from "./use-album-query";
import { useAlbumArtistQuery } from "./use-album-artist-query";
import { useTrackQuery } from "./use-track-query";
import { AlbumsView } from "./AlbumsView";
import { AlbumArtistsView } from "./AlbumArtistsView";
import { TracksView } from "./TracksView";
import { useLibraryRuntime, useLibraryWorkspace, libraryRetentionKey } from "./LibraryWorkspace";
import type { LibraryPresentation, LibraryViewProps } from "./library-view-types";

export function LibraryBrowserSurface({
  presentation,
  onOpenSettings,
  onPlayTrack,
  activeTrackId,
  playbackStatus,
  playbackAvailable,
  libraryRefreshKey = 0,
  scanError = null,
}: LibraryViewProps & { presentation: LibraryPresentation }) {
  const { setRawSearch, committedSearch, openAlbum, openAlbumArtist } = useLibraryWorkspace();
  const { client, scrollRegistry, queryRetention } = useLibraryRuntime();
  const search = committedSearch[presentation];
  const retention = useMemo(
    () => ({ key: libraryRetentionKey.root(presentation), registry: queryRetention }),
    [presentation, queryRetention],
  );
  const { element, setViewportElement, scrollToPosition } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: libraryRetentionKey.root(presentation), registry: scrollRegistry }),
      [presentation, scrollRegistry],
    ),
  );
  const albumQuery = useAlbumQuery(search, libraryRefreshKey, presentation === "albums", client, {
    retention,
  });
  const artistQuery = useAlbumArtistQuery(
    search,
    libraryRefreshKey,
    presentation === "albumArtists",
    client,
    { retention },
  );
  const trackQuery = useTrackQuery(search, libraryRefreshKey, presentation === "tracks", client, {
    retention,
  });
  const query = presentation === "albums" ? albumQuery : trackQuery;
  const previousSearch = useRef(search);
  useEffect(() => {
    const savedScroll = scrollRegistry.get(libraryRetentionKey.root(presentation));
    if (previousSearch.current !== search && (savedScroll === undefined || savedScroll === 0)) {
      scrollRegistry.set(`root:${presentation}`, 0);
      scrollToPosition(0, "instant");
    }
    previousSearch.current = search;
  }, [presentation, scrollRegistry, scrollToPosition, search]);
  const [hasRoots, setHasRoots] = useState<boolean | null>(null);
  useEffect(() => {
    void Promise.all([getLibraryStatus(), listLibraryRoots()])
      .then(([, roots]) => setHasRoots(roots.length > 0))
      .catch(() => setHasRoots(null));
  }, []);
  const empty = hasRoots === false ? "Add a music folder to start" : "No indexed music yet";
  return (
    <div
      ref={setViewportElement}
      className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
      data-library-surface="browser"
      data-scroll-region
    >
      <div>
        <section
          className="box-border w-full px-[var(--layout-inline-padding)] pb-16"
          data-presentation={presentation}
          aria-label="Library"
        >
          <div
            data-library-layout-owner
            className="mx-auto w-full max-w-[var(--content-max-width)]"
          >
            {scanError ? (
              <LibraryErrorNotice message={scanError} onOpenSettings={onOpenSettings} />
            ) : presentation === "albumArtists" ? (
              <AlbumArtistsView
                scrollRoot={element}
                onSelectArtist={(artist) => void openAlbumArtist(artist.key, artist)}
                query={artistQuery}
              />
            ) : query.error ? (
              <LibraryErrorNotice
                message={query.error}
                retry={query.retry}
                onOpenSettings={onOpenSettings}
              />
            ) : query.loading && query.items.length === 0 ? (
              <p className="my-12 text-text-secondary">Loading library…</p>
            ) : query.items.length === 0 ? (
              <div className="my-12 text-text-secondary">
                <p>{search ? "No matches" : empty}</p>
                <Button type="button" onClick={search ? () => setRawSearch("") : onOpenSettings}>
                  {search ? "Clear search" : "Open Library settings"}
                </Button>
              </div>
            ) : presentation === "albums" ? (
              <AlbumsView
                albums={albumQuery.items}
                onEnd={albumQuery.loadNext}
                hasMore={Boolean(albumQuery.nextCursor)}
                scrollRoot={element}
                onOpen={openAlbum}
              />
            ) : (
              <TracksView
                tracks={trackQuery.items}
                onEnd={trackQuery.loadNext}
                hasMore={Boolean(trackQuery.nextCursor)}
                playbackAvailable={playbackAvailable}
                onPlayTrack={onPlayTrack}
                activeTrackId={activeTrackId}
                playbackStatus={playbackStatus}
                scrollElement={element}
                className="w-full"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function LibraryErrorNotice({
  message,
  retry,
  onOpenSettings,
}: {
  message: string;
  retry?: () => Promise<void>;
  onOpenSettings: () => void;
}) {
  return (
    <div className="my-12 max-w-[70ch] text-error" role="alert">
      <p>{message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {retry ? (
          <Button type="button" onClick={() => void retry()}>
            Retry library
          </Button>
        ) : null}
        <Button type="button" onClick={onOpenSettings}>
          Open Library settings
        </Button>
      </div>
    </div>
  );
}
