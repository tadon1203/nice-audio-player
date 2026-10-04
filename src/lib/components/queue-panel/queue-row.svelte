<script lang="ts" module>
  /** Every queue row is this tall (px), which is what lets the list mount only the visible ones. */
  export const QUEUE_ROW_PX = 56;
</script>

<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import X from "@lucide/svelte/icons/x";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { PlaybackQueueItem } from "$lib/native";
  import Artwork from "$lib/ui/artwork.svelte";
  import { timeStateClass } from "$lib/ui/time-state";
  import { Button } from "$lib/ui/shadcn/button";
  import { cn } from "$lib/utils/cn.js";
  import { formatDuration } from "$lib/utils/format";

  let {
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
    dragHandlers?: HTMLButtonAttributes;
  } = $props();
</script>

<!-- Time has three luminances: the whole row (title, artist, duration) is as bright as its tone. -->
<div
  class={cn(
    "group/queue-row relative flex min-w-0 items-center gap-2 px-4 transition-colors duration-(--motion-move-duration) ease-(--motion-easing)",
    timeStateClass(tone === "current" ? "present" : tone === "past" ? "past" : "future"),
  )}
  style:height="{QUEUE_ROW_PX}px"
  data-tone={tone}
  aria-current={tone === "current" ? "true" : undefined}
>
  {#if dragHandlers}
    <button
      type="button"
      aria-label={`Drag ${item.title} to reorder`}
      data-slot="queue-drag-handle"
      class="relative z-10 -ml-2 shrink-0 cursor-grab touch-none rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...dragHandlers}
    >
      <GripVertical aria-hidden="true" class="size-4" />
    </button>
  {/if}
  {#if onPlay}
    <button
      type="button"
      aria-label={`Play ${item.title}`}
      onclick={onPlay}
      class="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    ></button>
  {/if}
  <Artwork artwork={item.artwork} class="size-10 shrink-0 rounded-md" />
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm" data-slot="queue-row-title">{item.title}</p>
    {#if item.artist}
      <p class="truncate text-sm">{item.artist}</p>
    {/if}
  </div>
  <span class="shrink-0 text-sm tabular-nums">
    {formatDuration(item.durationMs ?? null)}
  </span>
  {#if tone === "upcoming"}
    <div
      class="relative z-10 flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/queue-row:opacity-100"
    >
      <Button
        type="button"
        purpose="quiet"
        density="compactIcon"
        aria-label="Move earlier in queue"
        disabled={!canMoveEarlier}
        onclick={onMoveEarlier}
      >
        <ChevronUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        purpose="quiet"
        density="compactIcon"
        aria-label="Move later in queue"
        disabled={!canMoveLater}
        onclick={onMoveLater}
      >
        <ChevronDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        purpose="destructive"
        density="compactIcon"
        aria-label={`Remove ${item.title} from queue`}
        onclick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  {/if}
</div>
