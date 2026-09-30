import { useLayoutEffect, useRef, useState } from "react";
import { usePlaybackActions, usePlaybackQueue } from "@/entities/playback";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/shadcn/sheet";
import { useQueuePanel } from "@/features/toggle-queue-panel";
import { useShuffleCascade } from "../model/use-shuffle-cascade";
import { QueueFooter } from "./queue-footer";
import { QueueRow } from "./queue-row";
import { UpcomingList } from "./upcoming-list";

/** A 320px Acrylic panel from the right: what was played, the current track, and what is next. */
export function QueuePanel() {
  const { isOpen, close } = useQueuePanel();
  const { queue, shuffleEnabled } = usePlaybackQueue();
  const playback = usePlaybackActions();
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const cascading = useShuffleCascade(shuffleEnabled, isOpen);
  const history = queue?.history ?? [];
  // Opening the panel shows the current track at the top, with what was played above it.
  const currentRow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    currentRow.current?.scrollIntoView({ block: "start" });
  }, [scrollElement]);

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
          {queue && queue.upcomingCount > 0 ? (
            <UpcomingList scrollElement={scrollElement} cascading={cascading} />
          ) : null}
        </div>
        <QueueFooter />
      </SheetContent>
    </Sheet>
  );
}
