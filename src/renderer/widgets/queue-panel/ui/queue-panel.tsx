import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import { m } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import type { PlaybackQueueItem } from "@/shared/ipc";
import {
  usePlaybackActions,
  usePlaybackQueue,
  useUpcomingItems,
} from "@/renderer/entities/playback";
import { formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/renderer/shared/ui/shadcn/sheet";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { useQueueDrag } from "../model/use-queue-drag";
import { useQueuePanel } from "../model/use-queue-panel";

/** Every queue row is this tall (px), which is what lets the list mount only the visible ones. */
const ROW_PX = 56;
/** "Clear upcoming" can be undone up to this many tracks. */
const MAX_UNDO_TRACKS = 200;
const CASCADE_STEP_S = 0.015;
const CASCADE_WINDOW_MS = 1_000;

/**
 * A 320px Acrylic panel from the right. Upcoming tracks reorder by dragging
 * their handle to any position (`moveQueueItem` takes the target index), or one step at a time
 * with the buttons.
 */
export function QueuePanel() {
  const { isOpen, close } = useQueuePanel();
  const { queue, shuffleEnabled } = usePlaybackQueue();
  const playback = usePlaybackActions();
  // The upcoming list can be as long as the library: only the rows near the view are mounted.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const upcomingCount = queue?.upcomingCount ?? 0;
  const history = queue?.history ?? [];
  const { listRef, drag, handlersFor } = useQueueDrag(
    (id, to) => void playback.moveQueueItem(id, to),
    ROW_PX,
    upcomingCount,
    scrollElement,
  );
  const [listOffset, setListOffset] = useState(0);
  const hasCurrent = queue?.current != null;
  const hasUpcoming = upcomingCount > 0;
  const historyLength = history.length;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (scrollElement === null || list === null) return;
    setListOffset(
      list.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop -
        parseFloat(getComputedStyle(list).paddingTop),
    );
  }, [scrollElement, hasCurrent, listRef, hasUpcoming, historyLength]);
  const virtualizer = useVirtualizer({
    count: upcomingCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_PX,
    overscan: 8,
    scrollMargin: listOffset,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const firstRow = virtualRows[0]?.index;
  const lastRow = virtualRows.at(-1)?.index;
  const itemAt = useUpcomingItems(
    useMemo(
      () =>
        firstRow === undefined || lastRow === undefined ? null : { start: firstRow, end: lastRow },
      [firstRow, lastRow],
    ),
  );
  // Opening the panel shows the current track at the top, with what was played above it.
  const currentRow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    currentRow.current?.scrollIntoView({ block: "start" });
  }, [scrollElement]);
  const rowTransition = useMotionTransition("mediumMove");
  // What "Clear upcoming" removed, so it can be put back; forgotten when the track changes.
  const currentId = queue?.current?.id;
  const [clearedState, setCleared] = useState<{ ids: string[]; forId: string | undefined }>({
    ids: [],
    forId: undefined,
  });
  const cleared = clearedState.forId === currentId ? clearedState.ids : [];

  // Right after shuffle is switched with the panel open, rows settle top to bottom instead of
  // all at once. The new order arrives a moment later, so the flag stays up for a second.
  const [shuffleSeen, setShuffleSeen] = useState(shuffleEnabled);
  const [cascading, setCascading] = useState(false);
  if (shuffleSeen !== shuffleEnabled) {
    setShuffleSeen(shuffleEnabled);
    setCascading(isOpen);
  }
  useEffect(() => {
    if (!cascading) return;
    const timer = setTimeout(() => setCascading(false), CASCADE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [cascading]);

  return (
    // Not modal: the library stays visible and usable beside the queue, so there is no backdrop
    // and a click elsewhere does not close it (Escape and the queue button do).
    <Sheet
      open={isOpen}
      modal={false}
      disablePointerDismissal
      onOpenChange={(open) => (open ? undefined : close())}
    >
      <SheetContent side="right" overlay={false} className="w-80 gap-0 p-0" aria-label="Queue">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Queue</SheetTitle>
        </SheetHeader>
        <div ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto py-2">
          {history.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              tone="past"
              onPlay={() => void playback.playQueueItem(item.id)}
            />
          ))}
          {queue?.current ? (
            <div ref={currentRow}>
              <QueueRow item={queue.current} tone="current" />
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing playing.</p>
          )}
          {queue && upcomingCount > 0 ? (
            <ul
              ref={listRef}
              style={{
                paddingTop: virtualRows[0] ? virtualRows[0].start - listOffset : 0,
                paddingBottom: virtualRows.length
                  ? virtualizer.getTotalSize() - (virtualRows.at(-1)!.end - listOffset)
                  : 0,
              }}
            >
              {virtualRows.map(({ index }) => {
                const item = itemAt(index);
                // Beyond what the snapshot carries, a row waits for its chunk to arrive.
                if (item === undefined) {
                  return <li key={`waiting-${index}`} aria-hidden="true" className="h-14" />;
                }
                return (
                  <m.li
                    key={item.id}
                    layout="position"
                    animate={{
                      // The dragged row lifts; rows at and after the drop slot make room.
                      y:
                        drag !== null && drag.id !== item.id && index >= drag.slot
                          ? drag.rowHeight
                          : 0,
                      rotate: drag?.id === item.id ? 1 : 0,
                      scale: drag?.id === item.id ? 1.02 : 1,
                    }}
                    transition={
                      cascading
                        ? { ...rowTransition, delay: Math.min(index, 12) * CASCADE_STEP_S }
                        : rowTransition
                    }
                    className={cn(
                      "relative",
                      drag?.id === item.id && "z-10 rounded-lg bg-popover shadow-floating",
                    )}
                    style={{ "--drop-shift": `${drag?.rowHeight ?? 0}px` } as CSSProperties}
                    data-dragging={drag?.id === item.id ? "true" : undefined}
                    data-drop={dropMarker(drag?.slot ?? null, index, upcomingCount)}
                  >
                    <QueueRow
                      item={item}
                      tone="upcoming"
                      dragHandlers={handlersFor(item.id, index)}
                      onMoveEarlier={() => void playback.moveQueueItem(item.id, index - 1)}
                      onMoveLater={() => void playback.moveQueueItem(item.id, index + 1)}
                      canMoveEarlier={index > 0}
                      canMoveLater={index < upcomingCount - 1}
                      onPlay={() => void playback.playQueueItem(item.id)}
                      onRemove={() => void playback.removeQueueItem(item.id)}
                    />
                  </m.li>
                );
              })}
            </ul>
          ) : null}
        </div>
        {queue && upcomingCount > 0 ? (
          <div className="border-t border-border p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                // Putting tracks back is one command each, so only a short list is worth undoing.
                setCleared({
                  ids:
                    upcomingCount > MAX_UNDO_TRACKS
                      ? []
                      : queue.upcoming.flatMap((item) => (item.trackId ? [item.trackId] : [])),
                  forId: currentId,
                });
                void playback.clearQueue();
              }}
            >
              Clear upcoming
            </Button>
          </div>
        ) : cleared.length > 0 ? (
          <div
            role="status"
            className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm text-muted-foreground"
          >
            Cleared {cleared.length} {cleared.length === 1 ? "track" : "tracks"}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const restore = cleared;
                setCleared({ ids: [], forId: currentId });
                void (async () => {
                  for (const trackId of restore) await playback.enqueueTrack(trackId, false);
                })();
              }}
            >
              Undo
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Which edge of row `index` shows the drop line for insertion `slot`, if any. */
function dropMarker(slot: number | null, index: number, count: number) {
  if (slot === null) return undefined;
  if (slot === index) return "before";
  if (slot === count && index === count - 1) return "after";
  return undefined;
}

function QueueRow({
  item,
  tone,
  onMoveEarlier,
  onMoveLater,
  canMoveEarlier,
  canMoveLater,
  onRemove,
  onPlay,
  dragHandlers,
}: {
  item: PlaybackQueueItem;
  tone: "past" | "current" | "upcoming";
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  onRemove?: () => void;
  /** Jumps to this item (every row but the current one). */
  onPlay?: () => void;
  dragHandlers?: ComponentProps<"button">;
}) {
  return (
    <div
      className="group/queue-row relative flex h-14 min-w-0 items-center gap-2 px-4"
      data-tone={tone}
      aria-current={tone === "current" ? "true" : undefined}
    >
      {dragHandlers ? (
        <button
          type="button"
          aria-label={`Drag ${item.title} to reorder`}
          data-slot="queue-drag-handle"
          className="relative z-10 -ml-2 shrink-0 cursor-grab touch-none rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          {...dragHandlers}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      {onPlay ? (
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          onClick={onPlay}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      ) : null}
      <Artwork artwork={item.artwork} className="size-10 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            tone === "current" && "text-foreground",
            tone === "upcoming" && "text-muted-foreground",
            tone === "past" && "text-muted-foreground/60",
          )}
        >
          {item.title}
        </p>
        {item.artist ? (
          <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDuration(item.durationMs ?? null)}
      </span>
      {tone === "upcoming" ? (
        <div className="relative z-10 flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/queue-row:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move earlier in queue"
            disabled={!canMoveEarlier}
            onClick={onMoveEarlier}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move later in queue"
            disabled={!canMoveLater}
            onClick={onMoveLater}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.title} from queue`}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
