import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryAlbumSummary, LibraryTrackSummary } from "@/bindings";
import { getLibraryStatus, listLibraryRoots } from "@/api/library";
import { useAlbumQuery } from "./use-album-query";
import { useTrackQuery } from "./use-track-query";
import { AlbumsView } from "./AlbumsView";
import { TrackRow } from "./TrackRow";
import { AlbumDetailView } from "./AlbumDetailView";
import { ContentTransition } from "@/components/ui/ContentTransition";
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
  scrollElement?: HTMLElement | null;
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
  scrollElement = null,
}: Props) {
  const [presentation, setPresentation] = useState<"albums" | "tracks">("albums");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [hasRoots, setHasRoots] = useState<boolean | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbumSummary | null>(null);
  const browserScrollTop = useRef(0);
  const pendingFocusRef = useRef<"detail" | "browser" | null>(null);
  const focusAlbumIdRef = useRef<string | null>(null);
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
  const empty =
    hasRoots === false ? "Set up your library" : search ? "No matches" : "No indexed music yet";
  const query = presentation === "albums" ? albumQuery : trackQuery;
  useLayoutEffect(() => {
    if (pendingFocusRef.current === "detail" && selectedAlbum) {
      document.querySelector<HTMLButtonElement>(".album-detail__back")?.focus();
      pendingFocusRef.current = null;
    } else if (pendingFocusRef.current === "browser" && !selectedAlbum) {
      scrollElement?.scrollTo({
        top: browserScrollTop.current,
        behavior: "instant" as ScrollBehavior,
      });
      const card = focusAlbumIdRef.current
        ? document.querySelector<HTMLButtonElement>(`[data-album-id="${focusAlbumIdRef.current}"]`)
        : null;
      card?.focus({ preventScroll: true });
      pendingFocusRef.current = null;
    }
  }, [scrollElement, selectedAlbum]);
  const browser = (
    <section className="library-view" data-presentation={presentation} aria-label="Library">
      <header className="library-view__header">
        <div>
          <h1>Library</h1>
          <LibraryPresentationTabs presentation={presentation} onChange={setPresentation} />
        </div>
        <label className="library-view__search">
          <span className="sr-only">Search your library</span>
          <input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.currentTarget.value)}
            placeholder="Search your library..."
          />
        </label>
      </header>
      {scanError ? (
        <p className="library-view__notice" role="alert">
          {scanError}
        </p>
      ) : null}
      {query.error ? (
        <div className="library-view__notice" role="alert">
          {query.error}{" "}
          <button type="button" onClick={query.retry}>
            Retry
          </button>
        </div>
      ) : null}
      {query.loading && query.items.length === 0 ? (
        <p className="library-view__notice">Loading library…</p>
      ) : query.items.length === 0 ? (
        <div className="library-view__empty">
          <p>{empty}</p>
          <button type="button" onClick={onOpenSettings}>
            Open Library settings
          </button>
        </div>
      ) : presentation === "albums" ? (
        <ContentTransition contentKey="albums">
          <AlbumsView
            albums={albumQuery.items}
            onEnd={albumQuery.loadNext}
            hasMore={Boolean(albumQuery.nextAfterId)}
            onOpen={(album) => {
              browserScrollTop.current = scrollElement?.scrollTop ?? 0;
              focusAlbumIdRef.current = album.id;
              pendingFocusRef.current = "detail";
              setSelectedAlbum(album);
              scrollElement?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
            }}
          />
        </ContentTransition>
      ) : (
        <ContentTransition contentKey="tracks">
          <Tracks
            tracks={trackQuery.items}
            onEnd={trackQuery.loadNext}
            hasMore={Boolean(trackQuery.nextAfterId)}
            playbackAvailable={playbackAvailable}
            onPlayTrack={onPlayTrack}
            activeTrackId={activeTrackId}
            playbackStatus={playbackStatus}
            scrollElement={scrollElement}
          />
        </ContentTransition>
      )}
    </section>
  );
  const detail = selectedAlbum ? (
    <AlbumDetailView
      album={selectedAlbum}
      refreshKey={libraryRefreshKey}
      playbackAvailable={playbackAvailable}
      scrollElement={scrollElement}
      onPlayAlbumTrack={onPlayAlbumTrack}
      onPlayAlbum={onPlayAlbum}
      activeTrackId={activeTrackId}
      playbackStatus={playbackStatus}
      onBack={() => {
        pendingFocusRef.current = "browser";
        setSelectedAlbum(null);
      }}
    />
  ) : null;
  return (
    <ContentTransition contentKey={selectedAlbum ? `album:${selectedAlbum.id}` : "browser"}>
      {detail ?? browser}
    </ContentTransition>
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
  const scrollRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // TanStack Virtual owns mutable measurements outside React state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 84,
    scrollMargin,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  useLayoutEffect(() => {
    scrollRef.current = scrollElement;
    const update = () => {
      if (listRef.current && scrollRef.current)
        setScrollMargin(
          listRef.current.getBoundingClientRect().top -
            scrollRef.current.getBoundingClientRect().top +
            scrollRef.current.scrollTop,
        );
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
          const t = tracks[item.index];
          return (
            <div
              role="listitem"
              ref={rowVirtualizer.measureElement}
              data-index={item.index}
              key={t.id}
              style={{
                position: "absolute",
                insetInline: 0,
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <TrackRow
                track={t}
                playbackAvailable={playbackAvailable}
                onPlayTrack={onPlayTrack}
                active={
                  t.id === activeTrackId &&
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

