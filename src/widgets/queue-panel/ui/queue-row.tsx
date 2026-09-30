import type { ComponentProps } from "react";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import type { PlaybackQueueItem } from "@/shared/ipc";
import { formatDuration } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Artwork } from "@/shared/ui/artwork";
import { Button } from "@/shared/ui/shadcn/button";

/** Every queue row is this tall (px), which is what lets the list mount only the visible ones. */
export const QUEUE_ROW_PX = 56;

export function QueueRow({
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
