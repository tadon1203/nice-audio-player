import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryTrackSummary } from "@/bindings";
import { TrackRow } from "./TrackRow";

export function TracksView({
  tracks,
  onEnd,
  hasMore,
  playbackAvailable,
  onPlayTrack,
  activeTrackId,
  playbackStatus,
  scrollElement,
  className,
}: {
  tracks: LibraryTrackSummary[];
  onEnd: () => void;
  hasMore: boolean;
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  scrollElement: HTMLElement | null;
  className: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
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
      if (listRef.current && scrollElement)
        setScrollMargin(
          listRef.current.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop,
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
    <section className={className}>
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
