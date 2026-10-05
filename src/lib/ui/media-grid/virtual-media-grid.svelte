<script lang="ts" generics="Item">
  import { untrack, type Snippet } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import type { TransitionConfig } from "svelte/transition";
  import type { ArtworkRef } from "$lib/native";
  import RovingGlow, { type RovingTarget } from "$lib/ui/artwork-glow/roving-glow.svelte";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { createVirtualRows } from "$lib/ui/virtual-rows.svelte";
  import { createSortMotion } from "./sort-motion.svelte";
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
    itemKey,
    artworkAt,
    sortSignature,
    ontopindexchange,
    tile,
  }: {
    items: readonly Item[];
    /** The region the grid scrolls in (`null` while it is still mounting). */
    scrollElement: HTMLElement | null;
    itemKey: (item: Item) => string;
    /**
     * The artwork of the item at `index`. With it, hovering or focusing a tile lets a faint
     * Artwork glow from that artwork fall behind the grid.
     */
    artworkAt?: (index: number) => ArtworkRef | null | undefined;
    /** Changes when the sort does: tiles then slide (or fade) to their new places. */
    sortSignature: string;
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

  const sortMotion = createSortMotion(
    () => sortSignature,
    () => scrollElement,
  );
  // Under reduced motion a slide is a fade.
  const tileMotion = $derived(
    sortMotion.current === "slide" && prefersReducedMotion.current ? "fade" : sortMotion.current,
  );

  // The slide is a FLIP done by hand, only around a sort: Svelte's `animate:` measures every
  // tile on every update, which slowed the scroll restore down enough to break it.
  // `before` is where each tile was when the sort changed. The sorted items arrive later (from the
  // catalog), so the slide plays once tiles have actually moved, while the sort window is open.
  let before = new Map<string, DOMRect>();
  let watchedSignature = untrack(() => sortSignature);
  $effect.pre(() => {
    const signature = sortSignature;
    if (signature === watchedSignature) return;
    watchedSignature = signature;
    // Still the old DOM: where each mounted tile is now.
    before = new Map();
    list?.querySelectorAll<HTMLElement>("li[data-key]").forEach((element) => {
      before.set(element.dataset.key ?? "", element.getBoundingClientRect());
    });
    deactivateGlow();
  });

  $effect(() => {
    void visible;
    if (tileMotion !== "slide") {
      before = new Map();
      return;
    }
    if (before.size === 0 || list === null) return;
    const { duration, easing } = motionFor("move");
    const steps = 24;
    let moved = false;
    list.querySelectorAll<HTMLElement>("li[data-key]").forEach((element) => {
      const old = before.get(element.dataset.key ?? "");
      if (old === undefined) return;
      const now = element.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (dx === 0 && dy === 0) return;
      moved = true;
      const keyframes = Array.from({ length: steps + 1 }, (_, i) => {
        const left = 1 - easing(i / steps);
        return { transform: `translate(${dx * left}px, ${dy * left}px)` };
      });
      element.animate(keyframes, { duration });
    });
    if (moved) before = new Map();
  });

  function fadeIn(_node: Element): TransitionConfig {
    if (tileMotion !== "fade") return { duration: 0 };
    const { duration, easing } = motionFor("move");
    return { duration, easing, css: (t) => `opacity: ${t}` };
  }

  // The Artwork glow that follows the tile under the pointer or focus. Tiles report themselves (their
  // index and element), so nothing here reads the markup back out of the DOM.
  let target = $state<RovingTarget | null>(null);
  let targetTile: HTMLElement | null = null;

  function follow(index: number, tile: HTMLElement) {
    if (wrap === null || artworkAt === undefined) return;
    targetTile = tile;
    const box = tile.getBoundingClientRect();
    const origin = wrap.getBoundingClientRect();
    target = {
      artwork: artworkAt(index) ?? null,
      x: box.left - origin.left + box.width / 2,
      y: box.top - origin.top + box.height / 2,
      active: true,
    };
  }

  function deactivateGlow() {
    if (target !== null) target = { ...target, active: false };
    targetTile = null;
  }

  // Focus still in the grid, or the pointer still over it, keeps the Artwork glow on.
  function pointerLeft() {
    if (!wrap?.matches(":focus-within")) deactivateGlow();
  }

  function focusLeft(event: FocusEvent) {
    const to = event.relatedTarget;
    if (to instanceof Node && wrap?.contains(to)) return;
    if (!wrap?.matches(":hover")) deactivateGlow();
  }

  // A tile that is unmounted (filter, sort, scrolling away) no longer holds the Artwork glow.
  $effect(() => {
    void visible;
    if (targetTile !== null && !targetTile.isConnected) deactivateGlow();
  });

  const columns = $derived(columnCount(width, metrics));
  const rowCount = $derived(Math.ceil(items.length / columns));

  $effect(() => {
    const element = wrap;
    if (element === null) return;
    const measure = () => (width = element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const virtual = createVirtualRows({
    count: () => rowCount,
    scrollElement: () => scrollElement,
    rowHeight,
    overscan: OVERSCAN_ROWS,
    container: () => wrap,
    body: () => wrap,
  });

  const rows = $derived(virtual.items);
  const first = $derived((rows[0]?.index ?? 0) * columns);
  const last = $derived(Math.min(items.length, ((rows.at(-1)?.index ?? -1) + 1) * columns));
  const visible = $derived(items.slice(first, last));
  // The first row really in view (not the overscan rows above it) names the scroll index.
  const topIndex = $derived(virtual.topIndex * columns);
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
    const range = virtual.range;
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
        top: rowTop(next, columns, virtual.scrollMargin, metrics),
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
<!-- The wrapper only watches the pointer and focus leaving, for the Artwork glow; it is not interactive. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={wrap}
  class="relative [overflow-anchor:none] [overflow-clip-margin:0.5rem] overflow-clip"
  onpointerleave={pointerLeft}
  onfocusout={focusLeft}
>
  {#if artworkAt !== undefined && target !== null}
    <RovingGlow {target} />
  {/if}
  <!-- Keys bubble up from the tiles, which hold the focus; the list itself is not interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    bind:this={list}
    {onkeydown}
    class="relative grid justify-start gap-x-5 gap-y-8"
    style:grid-template-columns="repeat({columns}, {TILE_WIDTH_REM}rem)"
    style:grid-auto-rows="{TILE_HEIGHT_REM}rem"
    style:padding-top="{virtual.topSpacer}px"
    style:padding-bottom="{virtual.bottomSpacer}px"
    style:box-sizing="content-box"
  >
    {#each visible as item, offset (itemKey(item))}
      {@const index = first + offset}
      <li
        data-index={index}
        data-key={itemKey(item)}
        in:fadeIn
        onpointerenter={(event) => follow(index, event.currentTarget)}
        onfocusin={(event) => {
          focusedIndex = index;
          follow(index, event.currentTarget);
        }}
      >
        {@render tile(item, index)}
      </li>
    {/each}
  </ul>
</div>
