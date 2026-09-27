import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { PlaybackQueueItem } from "@/shared/ipc";
import { usePlaybackSession } from "@/renderer/features/playback-control";
import { formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/renderer/shared/ui/shadcn/sheet";
import { useQueuePanel } from "../model/use-queue-panel";

/**
 * A 320px Acrylic panel from the right (DESIGN.md, Queue). Reordering moves an item one slot
 * at a time (`moveQueueItem`) rather than free drag: the backend queue only exposes earlier/
 * later moves, and that is enough for a personal-project queue of a few dozen tracks.
 */
export function QueuePanel() {
  const { isOpen, close } = useQueuePanel();
  const playback = usePlaybackSession();
  const queue = playback.queue;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="right" className="w-80 gap-0 p-0" aria-label="Queue">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Queue</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {queue?.current ? (
            <QueueRow item={queue.current} tone="current" />
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing playing.</p>
          )}
          {queue && queue.upcoming.length > 0 ? (
            <ul>
              {queue.upcoming.map((item, index) => (
                <li key={item.id}>
                  <QueueRow
                    item={item}
                    tone="upcoming"
                    onMoveEarlier={() => void playback.moveQueueItem(item.id, "earlier")}
                    onMoveLater={() => void playback.moveQueueItem(item.id, "later")}
                    canMoveEarlier={index > 0}
                    canMoveLater={index < queue.upcoming.length - 1}
                    onRemove={() => void playback.removeQueueItem(item.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {queue && queue.upcoming.length > 0 ? (
          <div className="border-t border-border p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void playback.clearQueue()}
            >
              Clear upcoming
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function QueueRow({
  item,
  tone,
  onMoveEarlier,
  onMoveLater,
  canMoveEarlier,
  canMoveLater,
  onRemove,
}: {
  item: PlaybackQueueItem;
  tone: "current" | "upcoming";
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div
      className="group/queue-row flex min-w-0 items-center gap-2 px-4 py-2"
      data-tone={tone}
      aria-current={tone === "current" ? "true" : undefined}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            tone === "current" ? "text-foreground" : "text-muted-foreground",
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
        <div className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/queue-row:opacity-100">
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
