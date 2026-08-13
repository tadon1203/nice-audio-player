import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryScanSnapshot, LibraryTrackSummary } from "@/bindings";
import { getLibraryStatus, listLibraryRoots } from "@/api/library";
import { useAlbumQuery } from "./use-album-query";
import { useTrackQuery } from "./use-track-query";
import { AlbumsView } from "./AlbumsView";
import { TrackRow } from "./TrackRow";

interface Props {
  onOpenSettings: () => void;
  onPlayTrack: (id: string) => void;
  playbackAvailable: boolean;
  libraryRefreshKey?: number;
  scan?: LibraryScanSnapshot | null;
  scanError?: string | null;
  scrollElement?: HTMLElement | null;
}
export function LibraryView({
  onOpenSettings,
  onPlayTrack,
  playbackAvailable,
  libraryRefreshKey = 0,
  scan = null,
  scanError = null,
  scrollElement = null,
}: Props) {
  const [presentation, setPresentation] = useState<"albums" | "tracks">("albums");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [hasRoots, setHasRoots] = useState<boolean | null>(null);
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
  return (
    <section className="library-view" aria-label="Library">
      <header className="library-view__header">
        <div>
          <h1>Library</h1>
          <div className="library-view__switch" role="group" aria-label="Library presentation">
            <button
              type="button"
              className={presentation === "albums" ? "is-active" : ""}
              aria-pressed={presentation === "albums"}
              onClick={() => setPresentation("albums")}
            >
              Albums
            </button>
            <button
              type="button"
              className={presentation === "tracks" ? "is-active" : ""}
              aria-pressed={presentation === "tracks"}
              onClick={() => setPresentation("tracks")}
            >
              Tracks
            </button>
          </div>
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
      {scan?.state === "running" ? (
        <p className="library-view__scan">Scanning library… {scan.indexedCount} tracks indexed</p>
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
        <AlbumsView
          albums={albumQuery.items}
          onEnd={albumQuery.loadNext}
          hasMore={Boolean(albumQuery.nextAfterId)}
        />
      ) : (
        <Tracks
          tracks={trackQuery.items}
          onEnd={trackQuery.loadNext}
          hasMore={Boolean(trackQuery.nextAfterId)}
          playbackAvailable={playbackAvailable}
          onPlayTrack={onPlayTrack}
          scrollElement={scrollElement}
        />
      )}
    </section>
  );
}
function Tracks({
  tracks,
  onEnd,
  hasMore,
  playbackAvailable,
  onPlayTrack,
  scrollElement,
}: {
  tracks: LibraryTrackSummary[];
  onEnd: () => void;
  hasMore: boolean;
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
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
    estimateSize: () => 80,
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
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualItems.map((item) => {
          const t = tracks[item.index];
          return (
            <div
              ref={rowVirtualizer.measureElement}
              data-index={item.index}
              key={t.id}
              style={{
                position: "absolute",
                insetInline: 0,
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <TrackRow track={t} playbackAvailable={playbackAvailable} onPlayTrack={onPlayTrack} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
