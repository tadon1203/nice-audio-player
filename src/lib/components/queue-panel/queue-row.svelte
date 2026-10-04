<script lang="ts" module>
  /** Every queue row is this tall (px), which is what lets the list mount only the visible ones. */
  export const QUEUE_ROW_PX = 56;
</script>

<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import X from "@lucide/svelte/icons/x";
  import type { ButtonProps } from "$lib/ui/shadcn/button";
  import type { PlaybackQueueItem } from "$lib/native";
  import Artwork from "$lib/ui/artwork.svelte";
  import TimePresentation from "$lib/ui/time-presentation.svelte";
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
    dragHandlers?: Pick<
      ButtonProps,
      "onpointerdown" | "onpointermove" | "onpointerup" | "onpointercancel"
    >;
  } = $props();
</script>

<!-- Time has three luminances: the whole row (title, artist, duration) is as bright as its tone. -->
<div
  class={cn(
    "group/queue-row relative flex min-w-0 items-center gap-2 px-4 transition-colors duration-(--motion-move-duration) ease-(--motion-easing)",
  )}
  style:height="{QUEUE_ROW_PX}px"
  data-tone={tone}
  aria-current={tone === "current" ? "true" : undefined}
>
  <TimePresentation state={tone === "current" ? "present" : tone === "past" ? "past" : "future"}>
    {#if dragHandlers}
      <Button
        type="button"
        aria-label={`Drag ${item.title} to reorder`}
        data-slot="queue-drag-handle"
        purpose="bare"
        density="inline"
        geometry="drag"
        {...dragHandlers}
      >
        <GripVertical aria-hidden="true" class="size-4" />
      </Button>
    {/if}
    {#if onPlay}
      <Button
        type="button"
        aria-label={`Play ${item.title}`}
        onclick={onPlay}
        purpose="bare"
        density="inline"
        geometry="rowOverlay"
      ></Button>
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
  </TimePresentation>
</div>
