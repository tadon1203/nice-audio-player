<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import { SvelteFlip } from "#lib/components/ui/motion/svelte-flip";
  import { TokenTiming } from "#lib/components/ui/motion/token-timing";
  import { VirtualRows } from "#lib/components/ui/virtual-rows.svelte";
  import { cn } from "#lib/utils/cn.js";
  import { QueueDrag } from "./queue-drag.svelte";
  import QueueItem, { QUEUE_ROW_PX } from "./queue-row.svelte";

  /** Each row starts a little after the one above it. */
  const CASCADE_STEP_MS = TokenTiming.delayOf("feedback", 0.2);
  /** The `animate:` of a row: a directive takes a name, not a member. */
  const flipRow = SvelteFlip.motion;
  const CASCADE_ROWS = 12;

  let {
    cascading,
  }: {
    /** Rows settle top to bottom instead of all at once (right after shuffle changes). */
    cascading: boolean;
  } = $props();

  const { player: playback, actions } = useApp();

  const upcomingCount = $derived(playback.queue?.upcomingCount ?? 0);

  const queueDrag = new QueueDrag({
    onMove: (id, to): void => actions.run(() => playback.playerMoveQueueItem(id, to)),
    rowHeight: QUEUE_ROW_PX,
    count: (): number => upcomingCount,
  });
  const drag = $derived(queueDrag.drag);

  const virtual = new VirtualRows({
    count: (): number => upcomingCount,
    rowHeight: QUEUE_ROW_PX,
    overscan: 8,
  });

  const firstRow = $derived(virtual.items[0]?.index);
  const lastRow = $derived(virtual.items.at(-1)?.index);
  playback.followUpcoming(() =>
    firstRow === undefined || lastRow === undefined ? null : { start: firstRow, end: lastRow },
  );
  // Beyond what the snapshot carries, a row waits for its chunk to arrive.
  const rows = $derived(
    virtual.items.map(({ index }) => {
      const item = playback.upcomingAt(index);
      return { index, item, key: item?.queueItemId ?? `waiting-${index}` };
    }),
  );

  const motion = useApp().motion;
  const reduced = $derived(motion.reduced);

  /** Which edge of row `index` shows the drop line for insertion `slot`, if any. */
  function dropMarker(slot: number | null, index: number): "before" | "after" | undefined {
    if (slot === null) return undefined;
    if (slot === index) return "before";
    if (slot === upcomingCount && index === upcomingCount - 1) return "after";
    return undefined;
  }
</script>

<ul
  {@attach queueDrag.attachList}
  {@attach virtual.attachBody}
  style:padding-top="{virtual.topSpacer}px"
  style:padding-bottom="{virtual.bottomSpacer}px"
>
  {#each rows as { index, item, key } (key)}
    {@const dragging = item !== undefined && drag?.id === item.queueItemId}
    <li
      animate:flipRow={{
        delay: cascading && !reduced ? Math.min(index, CASCADE_ROWS) * CASCADE_STEP_MS : 0,
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
        <QueueItem
          {item}
          tone="upcoming"
          dragHandlers={queueDrag.handlersFor(item.queueItemId, index)}
          onMoveEarlier={() =>
            actions.run(() => playback.playerMoveQueueItem(item.queueItemId, index - 1))}
          onMoveLater={() =>
            actions.run(() => playback.playerMoveQueueItem(item.queueItemId, index + 1))}
          canMoveEarlier={index > 0}
          canMoveLater={index < upcomingCount - 1}
          onPlay={() => actions.run(() => playback.playerPlayQueueItem(item.queueItemId))}
          onRemove={() => actions.run(() => playback.playerRemoveQueueItem(item.queueItemId))}
        />
      {/if}
    </li>
  {/each}
</ul>
