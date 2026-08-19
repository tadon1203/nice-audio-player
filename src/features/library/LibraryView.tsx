import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryAlbumSummary, LibraryTrackSummary } from "@/bindings";
import { getLibraryStatus, listLibraryRoots } from "@/api/library";
import { Button } from "@/components/ui/Button";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { useAlbumQuery } from "./use-album-query";
import { useTrackQuery } from "./use-track-query";
import { AlbumsView } from "./AlbumsView";
import { TrackRow } from "./TrackRow";
import { AlbumDetailView } from "./AlbumDetailView";
import { LibraryPresentationTabs } from "./LibraryPresentationTabs";

interface Props {
  onOpenSettings: () => void;
  onPlayTrack: (id: string) => void;
  onPlayAlbum: (id: string) => void;
  onPlayAlbumTrack: (albumId: string, trackId: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  playbackAvailable: boolean;
  libraryRefreshKey?: number;
  scanError?: string | null;
}

export function LibraryView({
  onOpenSettings,
  onPlayTrack,
  onPlayAlbum,
  onPlayAlbumTrack,
  activeTrackId,
  playbackStatus,
  playbackAvailable,
  libraryRefreshKey = 0,
  scanError = null,
}: Props) {
  const [presentation, setPresentation] = useState<"albums" | "tracks">("albums");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [hasRoots, setHasRoots] = useState<boolean | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbumSummary | null>(null);
  const [returnFocusAlbumId, setReturnFocusAlbumId] = useState<string | null>(null);
  const browserScrollTop = useRef({ albums: 0, tracks: 0 });
  const {
    element: browserElement,
    setViewportElement: setBrowserViewportElement,
    setContentElement: setBrowserContentElement,
    scrollToPosition: scrollBrowserToPosition,
  } = useScrollRegion();
  const {
    setViewportElement: setDetailViewportElement,
    setContentElement: setDetailContentElement,
  } = useScrollRegion();
  const albumQuery = useAlbumQuery(search, libraryRefreshKey, presentation === "albums");
  const trackQuery = useTrackQuery(search, libraryRefreshKey, presentation === "tracks");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(rawSearch.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);
  useEffect(() => {
    void Promise.all([getLibraryStatus(), listLibraryRoots()])
      .then(([, roots]) => setHasRoots(roots.length > 0))
      .catch(() => setHasRoots(null));
  }, []);
  useLayoutEffect(() => {
    if (!selectedAlbum) scrollBrowserToPosition(browserScrollTop.current[presentation], "instant");
  }, [presentation, scrollBrowserToPosition, selectedAlbum]);

  const changePresentation = (next: "albums" | "tracks") => {
    if (next === presentation) return;
    browserScrollTop.current[presentation] = browserElement?.scrollTop ?? 0;
    setPresentation(next);
  };
  const empty = hasRoots === false ? "Add a music folder to start" : "No indexed music yet";
  const query = presentation === "albums" ? albumQuery : trackQuery;

  if (selectedAlbum) {
    return (
      <div
        key="detail"
        ref={setDetailViewportElement}
        className="library-scroll-surface"
        data-library-surface="detail"
        data-scroll-region
      >
        <div ref={setDetailContentElement}>
          <AlbumDetailView
            album={selectedAlbum}
            refreshKey={libraryRefreshKey}
            playbackAvailable={playbackAvailable}
            onPlayAlbumTrack={onPlayAlbumTrack}
            onPlayAlbum={onPlayAlbum}
            activeTrackId={activeTrackId}
            playbackStatus={playbackStatus}
            onBack={() => setSelectedAlbum(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      key="browser"
      ref={setBrowserViewportElement}
      className="library-scroll-surface"
      data-library-surface="browser"
      data-scroll-region
    >
      <div ref={setBrowserContentElement}>
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
                  onChange={changePresentation}
                />
                <label className="library-view__search">
                  <span className="sr-only">Search your library</span>
                  <input
                    value={rawSearch}
                    onChange={(event) => setRawSearch(event.currentTarget.value)}
                    placeholder="Search your library..."
                  />
                </label>
              </div>
            </header>
            {scanError || query.error ? (
              <div className="library-view__notice library-view__notice--error" role="alert">
                <p>{scanError ?? query.error}</p>
                <div className="library-view__notice-actions">
                  {query.error ? (
                    <Button type="button" onClick={query.retry}>
                      Retry library
                    </Button>
                  ) : null}
                  <Button type="button" onClick={onOpenSettings}>
                    Open Library settings
                  </Button>
                </div>
              </div>
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
                hasMore={Boolean(albumQuery.nextAfterId)}
                scrollRoot={browserElement}
                returnFocusAlbumId={returnFocusAlbumId}
                onReturnFocusRestored={() => setReturnFocusAlbumId(null)}
                onOpen={(album) => {
                  browserScrollTop.current.albums = browserElement?.scrollTop ?? 0;
                  setReturnFocusAlbumId(album.id);
                  setSelectedAlbum(album);
                }}
              />
            ) : (
              <Tracks
                tracks={trackQuery.items}
                onEnd={trackQuery.loadNext}
                hasMore={Boolean(trackQuery.nextAfterId)}
                playbackAvailable={playbackAvailable}
                onPlayTrack={onPlayTrack}
                activeTrackId={activeTrackId}
                playbackStatus={playbackStatus}
                scrollElement={browserElement}
              />
            )}
          </div>
        </section>
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
