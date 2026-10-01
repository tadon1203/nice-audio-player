<script lang="ts">
  import { flip } from "svelte/animate";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { createUpcomingItems } from "$lib/playback/upcoming-items.svelte";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { createVirtualRows } from "$lib/ui/virtual-rows.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { QueueDrag } from "./queue-drag.svelte";
  import QueueRow, { QUEUE_ROW_PX } from "./queue-row.svelte";

  const CASCADE_STEP_MS = 15;
  const CASCADE_ROWS = 12;

  let {
    scrollElement,
    content,
    cascading,
  }: {
    /** The region the list scrolls in. */
    scrollElement: HTMLElement | null;
    /** Everything inside that region; its size changes move the list. */
    content: HTMLElement | null;
    /** Rows settle top to bottom instead of all at once (right after shuffle changes). */
    cascading: boolean;
  } = $props();

  const playback = getPlayback();

  const upcomingCount = $derived(playback.queue?.upcomingCount ?? 0);
  let list = $state<HTMLUListElement | null>(null);

  const queueDrag = new QueueDrag({
    onMove: (id, to) => void playback.moveQueueItem(id, to),
    rowHeight: QUEUE_ROW_PX,
    count: () => upcomingCount,
    scrollElement: () => scrollElement,
    list: () => list,
  });
  const drag = $derived(queueDrag.drag);

  const virtual = createVirtualRows({
    count: () => upcomingCount,
    scrollElement: () => scrollElement,
    rowHeight: QUEUE_ROW_PX,
    overscan: 8,
    initialOffset: () => 0,
    container: () => content,
    body: () => list,
  });

  const firstRow = $derived(virtual.items[0]?.index);
  const lastRow = $derived(virtual.items.at(-1)?.index);
  const itemAt = createUpcomingItems(playback, () =>
    firstRow === undefined || lastRow === undefined ? null : { start: firstRow, end: lastRow },
  );
  // Beyond what the snapshot carries, a row waits for its chunk to arrive.
  const rows = $derived(
    virtual.items.map(({ index }) => {
      const item = itemAt.at(index);
      return { index, item, key: item?.id ?? `waiting-${index}` };
    }),
  );

  const budget = getMotionBudget();
  const reduced = $derived(budget.current === "reduced");
  const motion = $derived(motionFor("move", reduced));

  /** Which edge of row `index` shows the drop line for insertion `slot`, if any. */
  function dropMarker(slot: number | null, index: number): "before" | "after" | undefined {
    if (slot === null) return undefined;
    if (slot === index) return "before";
    if (slot === upcomingCount && index === upcomingCount - 1) return "after";
    return undefined;
  }
</script>

<ul
  bind:this={list}
  style:padding-top="{virtual.topSpacer}px"
  style:padding-bottom="{virtual.bottomSpacer}px"
>
  {#each rows as { index, item, key } (key)}
    {@const dragging = item !== undefined && drag?.id === item.id}
    <li
      animate:flip={{
        duration: reduced ? 0 : motion.duration,
        easing: motion.easing,
        delay: cascading ? Math.min(index, CASCADE_ROWS) * CASCADE_STEP_MS : 0,
      }}
      aria-hidden={item === undefined ? "true" : undefined}
      class={cn(
        "relative transition-[translate,rotate,scale]",
        reduced && "transition-none",
        dragging && "z-10 rounded-lg bg-popover shadow-floating",
      )}
      style:height="{QUEUE_ROW_PX}px"
      style:translate={drag !== null && !dragging && index >= drag.slot
        ? `0 ${queueDrag.rowHeight}px`
        : undefined}
      style:rotate={dragging && !reduced ? "1deg" : undefined}
      style:scale={dragging && !reduced ? "1.02" : undefined}
      style:--drop-shift="{queueDrag.rowHeight}px"
      data-dragging={dragging ? "true" : undefined}
      data-drop={dropMarker(drag?.slot ?? null, index)}
    >
      {#if item !== undefined}
        <QueueRow
          {item}
          tone="upcoming"
          dragHandlers={queueDrag.handlersFor(item.id, index)}
          onMoveEarlier={() => void playback.moveQueueItem(item.id, index - 1)}
          onMoveLater={() => void playback.moveQueueItem(item.id, index + 1)}
          canMoveEarlier={index > 0}
          canMoveLater={index < upcomingCount - 1}
          onPlay={() => void playback.playQueueItem(item.id)}
          onRemove={() => void playback.removeQueueItem(item.id)}
        />
      {/if}
    </li>
  {/each}
</ul>
