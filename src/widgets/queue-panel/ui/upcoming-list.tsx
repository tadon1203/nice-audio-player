import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { m } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePlaybackActions, usePlaybackQueue, useUpcomingItems } from "@/entities/playback";
import { cn } from "@/shared/lib/utils";
import { useMotionTransition } from "@/shared/ui/motion";
import { useQueueDrag } from "../model/use-queue-drag";
import { QUEUE_ROW_PX, QueueRow } from "./queue-row";

const CASCADE_STEP_S = 0.015;

/**
 * The upcoming tracks, which can be as long as the library: only the rows near the view are
 * mounted. Rows reorder by dragging their handle to any position (`moveQueueItem` takes the
 * target index), or one step at a time with the buttons.
 */
export function UpcomingList({
  scrollElement,
  cascading,
}: {
  scrollElement: HTMLDivElement | null;
  /** Rows settle top to bottom instead of all at once (right after shuffle changes). */
  cascading: boolean;
}) {
  const { queue } = usePlaybackQueue();
  const playback = usePlaybackActions();
  const upcomingCount = queue?.upcomingCount ?? 0;
  const hasCurrent = queue?.current != null;
  const historyLength = queue?.history.length ?? 0;
  const { listRef, drag, handlersFor } = useQueueDrag(
    (id, to) => void playback.moveQueueItem(id, to),
    QUEUE_ROW_PX,
    upcomingCount,
    scrollElement,
  );
  const [listOffset, setListOffset] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (scrollElement === null || list === null) return;
    setListOffset(
      list.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop -
        parseFloat(getComputedStyle(list).paddingTop),
    );
  }, [scrollElement, hasCurrent, listRef, historyLength]);
  const virtualizer = useVirtualizer({
    count: upcomingCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => QUEUE_ROW_PX,
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
  const rowTransition = useMotionTransition("mediumMove");

  return (
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
              y: drag !== null && drag.id !== item.id && index >= drag.slot ? drag.rowHeight : 0,
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
  );
}

/** Which edge of row `index` shows the drop line for insertion `slot`, if any. */
function dropMarker(slot: number | null, index: number, count: number) {
  if (slot === null) return undefined;
  if (slot === index) return "before";
  if (slot === count && index === count - 1) return "after";
  return undefined;
}
