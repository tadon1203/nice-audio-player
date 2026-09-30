<script lang="ts" generics="Item">
  import type { Snippet } from "svelte";
  import { get } from "svelte/store";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import {
    columnCount,
    keyTarget,
    rowTop,
    scrollOffsetToReveal,
    type GridMetrics,
  } from "./media-grid-model";

  let {
    items,
    scrollElement,
    initialOffset = 0,
    itemKey,
    ontopindexchange,
    tile,
  }: {
    items: readonly Item[];
    /** The region the grid scrolls in (`null` while it is still mounting). */
    scrollElement: HTMLElement | null;
    initialOffset?: number;
    itemKey: (item: Item) => string;
    /** Told the index of the first tile in view, for the scroll index label. */
    ontopindexchange?: (index: number) => void;
    tile: Snippet<[Item, number]>;
  } = $props();

  /** Tile column width, column gap and row height, in rem. */
  const TILE_WIDTH_REM = 12;
  const COLUMN_GAP_REM = 1.25;
  const TILE_HEIGHT_REM = 15.5;
  const ROW_GAP_REM = 2;
  const OVERSCAN_ROWS = 3;

  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const metrics: GridMetrics = {
    tileWidth: TILE_WIDTH_REM * rem,
    columnGap: COLUMN_GAP_REM * rem,
    tileHeight: TILE_HEIGHT_REM * rem,
    rowGap: ROW_GAP_REM * rem,
  };
  const rowHeight = metrics.tileHeight + metrics.rowGap;

  let wrap = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  let width = $state(0);
  let scrollMargin = $state(0);

  const columns = $derived(columnCount(width, metrics));
  const rowCount = $derived(Math.ceil(items.length / columns));

  $effect(() => {
    const element = wrap;
    const scroller = scrollElement;
    if (element === null) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      width = box.width;
      if (scroller !== null) {
        scrollMargin = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => null,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN_ROWS,
  });

  // The scroll region exists only after it is bound, and the row count and scroll margin change
  // with the width, so the virtualizer is told again each time. Read through `get` so this effect
  // does not depend on the store it updates.
  $effect(() => {
    const element = scrollElement;
    const instance = get(virtualizer);
    instance.setOptions({
      count: rowCount,
      getScrollElement: () => element,
      estimateSize: () => rowHeight,
      scrollMargin,
    });
    instance._willUpdate();
    instance.measure();
  });

  // The region cannot scroll further than the padding the virtualizer has produced, which
  // arrives a frame or two after the first layout; wait for it before applying the offset.
  let restored = false;
  $effect(() => {
    const element = scrollElement;
    if (restored || element === null || width === 0) return;
    restored = true;
    if (initialOffset === 0) return;
    let frames = 0;
    let frame = 0;
    const step = () => {
      const reachable = element.scrollHeight - element.clientHeight >= initialOffset;
      if (reachable || frames++ > 30) element.scrollTop = initialOffset;
      else frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  });

  const rows = $derived($virtualizer.getVirtualItems());
  const firstRow = $derived(rows[0]);
  const lastRow = $derived(rows.at(-1));
  const first = $derived((firstRow?.index ?? 0) * columns);
  const last = $derived(Math.min(items.length, ((lastRow?.index ?? -1) + 1) * columns));
  const visible = $derived(items.slice(first, last));
  // The first row really in view (not the overscan rows above it) names the scroll index.
  const topIndex = $derived.by(() => {
    void rows;
    return ($virtualizer.range?.startIndex ?? 0) * columns;
  });
  $effect(() => ontopindexchange?.(topIndex));

  // Arrow keys move focus between tiles. A tile that is not mounted yet is scrolled to and
  // focused once it is.
  let focusedIndex: number | null = null;
  let wanted: number | null = null;

  function focusWanted() {
    if (wanted === null) return;
    const element = list?.querySelector<HTMLElement>(`li[data-index="${wanted}"]`);
    if (!element) return;
    wanted = null;
    // The scroll is already ours; the browser must not add its own.
    element.querySelector<HTMLElement>("a[href], button")?.focus({ preventScroll: true });
  }
  $effect(() => {
    void visible;
    focusWanted();
  });

  function onkeydown(event: KeyboardEvent) {
    if (focusedIndex === null || event.ctrlKey || event.altKey || event.metaKey) return;
    const range = $virtualizer.range;
    const next = keyTarget(event.key, {
      from: focusedIndex,
      columns,
      count: items.length,
      pageRows: Math.max(1, (range?.endIndex ?? 0) - (range?.startIndex ?? 0)),
    });
    if (next === null) return;
    // Focus is in the collection, so the arrows are the collection's (not the seek keys').
    event.preventDefault();
    wanted = next;
    if (scrollElement !== null) {
      const offset = scrollOffsetToReveal({
        top: rowTop(next, columns, scrollMargin, metrics),
        height: metrics.tileHeight,
        scrollTop: scrollElement.scrollTop,
        viewHeight: scrollElement.clientHeight,
      });
      if (offset !== null) scrollElement.scrollTop = offset;
    }
    focusWanted();
  }
</script>

<!--
  Mounts only the rows near the view, so a library of any size keeps the same number of tiles in
  the DOM. Rows are padding and mounted tiles; the browser must not "anchor" the scroll position
  to a tile that is about to be replaced.
-->
<div
  bind:this={wrap}
  class="relative [overflow-anchor:none] [overflow-clip-margin:0.5rem] overflow-clip"
>
  <!-- Keys bubble up from the tiles, which hold the focus; the list itself is not interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    bind:this={list}
    {onkeydown}
    class="relative grid justify-start gap-x-5 gap-y-8"
    style:grid-template-columns="repeat({columns}, {TILE_WIDTH_REM}rem)"
    style:grid-auto-rows="{TILE_HEIGHT_REM}rem"
    style:padding-top="{firstRow ? firstRow.start - scrollMargin : 0}px"
    style:padding-bottom="{lastRow
      ? $virtualizer.getTotalSize() - (lastRow.end - scrollMargin)
      : 0}px"
    style:box-sizing="content-box"
  >
    {#each visible as item, offset (itemKey(item))}
      {@const index = first + offset}
      <li data-index={index} onfocusin={() => (focusedIndex = index)}>
        {@render tile(item, index)}
      </li>
    {/each}
  </ul>
</div>
