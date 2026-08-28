import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumKey,
  LibraryAlbumSummary,
  LibraryTrackSummary,
} from "@/bindings";
import { getLibraryStatus, listLibraryRoots } from "@/api/library";
import { Button } from "@/components/ui/Button";
import { ExclusiveRegion } from "@/components/ui/ExclusiveRegion";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { useAlbumQuery } from "./use-album-query";
import { useAlbumArtistQuery } from "./use-album-artist-query";
import { useTrackQuery } from "./use-track-query";
import { useAlbumDetailQuery } from "./use-album-detail-query";
import { useAlbumArtistDetailQuery } from "./use-album-artist-detail-query";
import { AlbumsView } from "./AlbumsView";
import { AlbumArtistsView, AlbumArtistDetailView } from "./AlbumArtistsView";
import { AlbumDetailView } from "./AlbumDetailView";
import { TrackRow } from "./TrackRow";
import { LibraryPresentationTabs } from "./LibraryPresentationTabs";
import {
  useLibraryFocusRestore,
  useLibraryWorkspace,
  type LibraryNavigationFrame,
} from "./LibraryWorkspace";

interface Props {
  onOpenSettings: () => void;
  onPlayTrack: (id: string) => void;
  onPlayAlbum: (key: LibraryAlbumKey) => void;
  onPlayAlbumTrack: (albumKey: LibraryAlbumKey, trackId: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  playbackAvailable: boolean;
  libraryRefreshKey?: number;
  scanError?: string | null;
}
function markScrollSurfacesExiting() {
  document
    .querySelectorAll<HTMLElement>("[data-library-surface]")
    .forEach((surface) => (surface.dataset.scrollSurfaceExiting = "true"));
}

export function LibraryView(props: Props) {
  const { presentation, currentFrame, back, setPresentation } = useLibraryWorkspace();
  useLibraryFocusRestore();
  if (currentFrame?.kind === "album") {
    return (
      <ExclusiveRegion activeKey={currentFrame.id} className="library-route-region">
        <AlbumSurface {...props} frame={currentFrame} onBack={back} />
      </ExclusiveRegion>
    );
  }
  if (currentFrame?.kind === "albumArtist") {
    return (
      <ExclusiveRegion activeKey={currentFrame.id} className="library-route-region">
        <AlbumArtistSurface {...props} frame={currentFrame} onBack={back} />
      </ExclusiveRegion>
    );
  }
  return (
    <ExclusiveRegion activeKey={`root:${presentation}`} className="library-route-region">
      <LibraryBrowserSurface
        key={presentation}
        {...props}
        presentation={presentation}
        onChangePresentation={setPresentation}
      />
    </ExclusiveRegion>
  );
}

function LibraryBrowserSurface({
  presentation,
  onChangePresentation,
  onOpenSettings,
  onPlayTrack,
  activeTrackId,
  playbackStatus,
  playbackAvailable,
  libraryRefreshKey = 0,
  scanError = null,
}: Props & {
  presentation: "albums" | "albumArtists" | "tracks";
  onChangePresentation: (value: "albums" | "albumArtists" | "tracks") => void;
}) {
  const {
    rawSearch,
    setRawSearch,
    committedSearch,
    client,
    scrollRegistry,
    queryRetention,
    openAlbum,
    openAlbumArtist,
  } = useLibraryWorkspace();
  const search = committedSearch[presentation];
  const rawValue = rawSearch[presentation];
  const retention = useMemo(
    () => ({ key: `root:${presentation}`, registry: queryRetention }),
    [presentation, queryRetention],
  );
  const { element, setViewportElement, scrollToPosition } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: `root:${presentation}`, registry: scrollRegistry }),
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
  const previousSearch = useRef(search);
  useEffect(() => {
    if (previousSearch.current !== search) {
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
  const query = presentation === "albums" ? albumQuery : trackQuery;
  const handlePresentationChange = useCallback(
    (next: "albums" | "albumArtists" | "tracks") => {
      markScrollSurfacesExiting();
      if (element) {
        scrollRegistry.set(`root:${presentation}`, element.scrollTop);
      }
      onChangePresentation(next);
    },
    [element, onChangePresentation, presentation, scrollRegistry],
  );
  return (
    <div
      ref={setViewportElement}
      className="library-scroll-surface"
      data-library-surface="browser"
      data-scroll-region
    >
      <div>
        <section
          className="library-view page-frame"
          data-presentation={presentation}
          aria-label="Library"
        >
          <div className="library-view__content content-frame">
            <header className="library-view__header">
              <h1 className="type-application-heading">Library</h1>
              <div className="library-view__controls">
                <LibraryPresentationTabs
                  presentation={presentation}
                  onChange={handlePresentationChange}
                />
                <label className="library-view__search">
                  <span className="sr-only">
                    Filter {presentation === "albumArtists" ? "album artists" : presentation}
                  </span>
                  <input
                    value={rawValue}
                    onChange={(event) => setRawSearch(event.currentTarget.value)}
                    placeholder={
                      presentation === "albums"
                        ? "Filter albums…"
                        : presentation === "albumArtists"
                          ? "Filter album artists…"
                          : "Filter tracks…"
                    }
                  />
                </label>
              </div>
            </header>
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
              <p className="library-view__notice">Loading library…</p>
            ) : query.items.length === 0 ? (
              <div className="library-view__empty">
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
              <Tracks
                tracks={trackQuery.items}
                onEnd={trackQuery.loadNext}
                hasMore={Boolean(trackQuery.nextCursor)}
                playbackAvailable={playbackAvailable}
                onPlayTrack={onPlayTrack}
                activeTrackId={activeTrackId}
                playbackStatus={playbackStatus}
                scrollElement={element}
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
    <div className="library-view__notice library-view__notice--error" role="alert">
      <p>{message}</p>
      <div className="library-view__notice-actions">
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

function AlbumSurface({
  frame,
  onBack,
  ...props
}: Props & { frame: LibraryNavigationFrame; onBack: () => void }) {
  const { client, scrollRegistry, queryRetention } = useLibraryWorkspace();
  const { setViewportElement } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: `frame:${frame.id}`, registry: scrollRegistry }),
      [frame.id, scrollRegistry],
    ),
  );
  const retention = useMemo(
    () => ({ key: `frame:${frame.id}`, registry: queryRetention }),
    [frame.id, queryRetention],
  );
  const album = frame.summary as LibraryAlbumSummary;
  return (
    <div
      ref={setViewportElement}
      className="library-scroll-surface"
      data-library-surface="detail"
      data-scroll-region
    >
      <div>
        <AlbumDetailSurfaceContent
          {...props}
          album={album}
          client={client}
          retention={{ retention }}
          refreshKey={props.libraryRefreshKey ?? 0}
          onBack={onBack}
        />
      </div>
    </div>
  );
}

function AlbumDetailSurfaceContent({
  album,
  client,
  retention,
  refreshKey,
  onBack,
  ...props
}: Props & {
  album: LibraryAlbumSummary;
  client: import("./LibraryWorkspace").LibraryBrowseClient;
  retention: import("./use-paged-library-query").PagedLibraryQueryOptions;
  refreshKey: number;
  onBack: () => void;
}) {
  const { openAlbumArtist } = useLibraryWorkspace();
  const query = useAlbumDetailQuery(album.key, refreshKey, true, client, retention);
  return (
    <AlbumDetailView
      {...props}
      album={album}
      refreshKey={refreshKey}
      onBack={onBack}
      query={query}
      onOpenAlbumArtist={(key) => void openAlbumArtist(key)}
    />
  );
}

function AlbumArtistSurface({
  frame,
  onBack,
  ...props
}: Props & { frame: LibraryNavigationFrame; onBack: () => void }) {
  const { client, scrollRegistry, queryRetention } = useLibraryWorkspace();
  const { element, setViewportElement } = useScrollRegion(
    undefined,
    useMemo(
      () => ({ key: `frame:${frame.id}`, registry: scrollRegistry }),
      [frame.id, scrollRegistry],
    ),
  );
  const artistKey = frame.key as LibraryAlbumArtistKey;
  const detail = useAlbumArtistDetailQuery(
    artistKey,
    frame.summary as LibraryAlbumArtistSummary | undefined,
    props.libraryRefreshKey ?? 0,
    client,
    { retention: { key: `frame:${frame.id}`, registry: queryRetention } },
  );
  const { openAlbum } = useLibraryWorkspace();
  return (
    <div
      ref={setViewportElement}
      className="library-scroll-surface"
      data-library-surface="artist-detail"
      data-scroll-region
    >
      <div>
        <AlbumArtistDetailView
          artist={detail.summary}
          artistKey={artistKey}
          summaryLoading={detail.summaryLoading}
          summaryError={detail.summaryError}
          onRetrySummary={detail.retrySummary}
          scrollRoot={element}
          onBack={onBack}
          onOpenAlbum={openAlbum}
          query={detail.albums}
        />
      </div>
    </div>
  );
}

function Tracks({
  tracks,
  onEnd,
  hasMore,
  playbackAvailable,
  onPlayTrack,
  activeTrackId,
  playbackStatus,
  scrollElement,
}: {
  tracks: LibraryTrackSummary[];
  onEnd: () => void;
  hasMore: boolean;
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  scrollElement: HTMLElement | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // TanStack Virtual owns mutable measurements outside React state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 84,
    scrollMargin,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const update = () => {
      if (listRef.current && scrollElement) {
        setScrollMargin(
          listRef.current.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop,
        );
      }
    };
    update();
    const owner = listRef.current?.closest<HTMLElement>(".library-view");
    const observer = new ResizeObserver(update);
    if (owner) observer.observe(owner);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [scrollElement]);
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= tracks.length - 1 && hasMore) onEnd();
  }, [hasMore, onEnd, tracks.length, virtualItems]);
  return (
    <section>
      <h2>Tracks</h2>
      <div
        ref={listRef}
        className="library-view__tracks"
        role="list"
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualItems.map((item) => {
          const track = tracks[item.index];
          return (
            <div
              role="listitem"
              ref={rowVirtualizer.measureElement}
              data-index={item.index}
              key={track.id}
              style={{
                position: "absolute",
                insetInline: 0,
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <TrackRow
                track={track}
                playbackAvailable={playbackAvailable}
                onPlayTrack={onPlayTrack}
                active={
                  track.id === activeTrackId &&
                  (playbackStatus === "playing" || playbackStatus === "paused")
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
