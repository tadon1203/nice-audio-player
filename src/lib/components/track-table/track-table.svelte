<script lang="ts">
  import { get } from "svelte/store";
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { goto } from "$app/navigation";
  import { toggleSortDirection, trackSortLabels } from "$lib/library/sort";
  import { toNameSegment } from "$lib/library/unknown-name";
  import type { LibrarySortDirection, LibraryTrackSortKey } from "$lib/native";
  import { requireNative } from "$lib/native";
  import { getPlayback } from "$lib/playback/context";
  import MenuContent from "$lib/ui/menu/menu-content.svelte";
  import MenuItem from "$lib/ui/menu/menu-item.svelte";
  import PlayPauseIcon from "$lib/ui/play-pause-icon.svelte";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import {
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/ui/shadcn/table";
  import { cn } from "$lib/utils/cn.js";
  import {
    albumArtistOf,
    columnText,
    isTrackAvailable,
    libraryTrackColumns,
    rowClickIntent,
    trackRowAction,
    trackTableBreakpoints,
    TRACK_ROW_HEIGHT,
    type TrackColumn,
    type TrackPlaybackStatus,
    type TrackTableRow,
  } from "./track-columns";
  import TrackPropertiesSheet from "./track-properties-sheet.svelte";

  let {
    rows,
    caption,
    scrollElement,
    initialOffset = 0,
    ontopindexchange,
    activeTrackId = null,
    playbackStatus = "stopped",
    sortKey,
    sortDirection = "ascending",
    onsortchange,
    onplaytrack,
    onpauseactive,
    onresumeactive,
  }: {
    rows: readonly TrackTableRow[];
    caption: string;
    /** The region the table scrolls in (`null` while it is still mounting). */
    scrollElement: HTMLElement | null;
    initialOffset?: number;
    /** Told the index of the first row in view, for the scroll index label. */
    ontopindexchange?: (index: number) => void;
    activeTrackId?: string | null;
    playbackStatus?: TrackPlaybackStatus;
    sortKey?: LibraryTrackSortKey;
    sortDirection?: LibrarySortDirection;
    onsortchange?: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
    onplaytrack: (id: string) => void;
    onpauseactive?: () => void;
    onresumeactive?: () => void;
  } = $props();

  const OVERSCAN_ROWS = 10;
  const columns = libraryTrackColumns;
  const playback = getPlayback();

  let propertiesFor = $state<string | null>(null);
  let wrap = $state<HTMLElement | null>(null);
  let body = $state<HTMLElement | null>(null);
  let measured = $state(false);
  let scrollMargin = $state(0);

  // Where the first row sits inside the scroll region (below the header), re-measured when the
  // container resizes.
  $effect(() => {
    const element = wrap;
    const scroller = scrollElement;
    const first = body;
    if (element === null || first === null) return;
    const measure = () => {
      if (scroller !== null) {
        scrollMargin =
          first.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
      }
      measured = true;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => null,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  // The scroll region exists only after it is bound, and the count and scroll margin change, so
  // the virtualizer is told again each time. Read through `get` so this effect does not depend on
  // the store it updates.
  $effect(() => {
    const element = scrollElement;
    const instance = get(virtualizer);
    instance.setOptions({
      count: rows.length,
      getScrollElement: () => element,
      estimateSize: () => TRACK_ROW_HEIGHT,
      overscan: OVERSCAN_ROWS,
      scrollMargin,
    });
    instance._willUpdate();
    instance.measure();
  });

  // The region cannot scroll further than the spacer the virtualizer has produced, which arrives
  // a frame or two after the first layout; wait for it before applying the offset.
  let restored = false;
  $effect(() => {
    const element = scrollElement;
    if (restored || element === null || !measured) return;
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

  const items = $derived($virtualizer.getVirtualItems());
  const firstItem = $derived(items[0]);
  const lastItem = $derived(items.at(-1));
  const topSpacer = $derived(firstItem ? firstItem.start - scrollMargin : 0);
  const bottomSpacer = $derived(
    lastItem ? $virtualizer.getTotalSize() - (lastItem.end - scrollMargin) : 0,
  );
  // The first row really in view (not the overscan rows above it) names the scroll index.
  const topIndex = $derived.by(() => {
    void items;
    return $virtualizer.range?.startIndex ?? 0;
  });
  $effect(() => ontopindexchange?.(topIndex));

  /** Width (for `<col>` only) and breakpoint visibility from one column definition. */
  function columnClass(column: TrackColumn, withWidth = false) {
    return cn(
      withWidth && column.width,
      column.hideBelow && trackTableBreakpoints[column.hideBelow],
    );
  }

  function isInteractiveTarget(event: MouseEvent) {
    const target = event.target;
    return (
      target instanceof Element &&
      target.closest("button, a, input, select, textarea, [role='button'], [data-row-action]") !==
        null
    );
  }

  function activateRow(event: MouseEvent, row: TrackTableRow) {
    if (isInteractiveTarget(event)) return;
    const intent = rowClickIntent(row, activeTrackId, playbackStatus);
    if (intent === "play") onplaytrack(row.id);
    else if (intent === "resume") onresumeactive?.();
  }

  function goToAlbum(row: TrackTableRow) {
    if (!row.album) return;
    // Plain strings, not resolve(): the album and artist routes land in ticket 08.
    const artist = encodeURIComponent(toNameSegment(albumArtistOf(row)));
    const album = encodeURIComponent(toNameSegment(row.album.trim()));
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(`/library/albums/${artist}/${album}`);
  }

  function goToArtist(row: TrackTableRow) {
    const artist = encodeURIComponent(toNameSegment(albumArtistOf(row)));
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(`/library/album-artists/${artist}`);
  }
</script>

<div bind:this={wrap} class="@container/track-table min-w-0">
  <!-- Not the shadcn Table root: its overflow wrapper would break the sticky header. -->
  <table class="w-full table-fixed border-collapse text-sm">
    <colgroup>
      {#each columns as column (column.id)}
        <col class={columnClass(column, true)} />
      {/each}
    </colgroup>
    <TableCaption class="sr-only">{caption}</TableCaption>
    <TableHeader class="acrylic sticky top-0 z-10 text-left text-muted-foreground">
      <TableRow class="h-9 border-b border-border">
        {#each columns as column (column.id)}
          {@const key = column.sortKey}
          {@const active = key !== undefined && key === sortKey}
          <TableHead
            scope="col"
            data-column-id={column.id}
            class={cn("px-3 font-medium last:text-right", columnClass(column))}
            aria-sort={active ? sortDirection : undefined}
          >
            {#if key !== undefined && onsortchange}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="-mx-2 h-8 px-2 text-sm"
                aria-label="Sort by {trackSortLabels[key]}"
                onclick={() =>
                  onsortchange(key, active ? toggleSortDirection(sortDirection) : "ascending")}
              >
                <span>{column.header}</span>
                {#if active}
                  {#if sortDirection === "ascending"}
                    <ArrowUp aria-hidden="true" />
                  {:else}
                    <ArrowDown aria-hidden="true" />
                  {/if}
                {/if}
              </Button>
            {:else}
              {column.header}
            {/if}
          </TableHead>
        {/each}
      </TableRow>
    </TableHeader>
    <TableBody bind:ref={body}>
      <!-- Spacer heights must jump, never animate: the reduced-motion rule gives every element a
           transition, and a lagging spacer puts the rows in the wrong place. -->
      {#if topSpacer > 0}
        <tr aria-hidden="true">
          <td colspan={columns.length} class="p-0"
            ><div class="transition-none" style:height="{topSpacer}px"></div></td
          >
        </tr>
      {/if}
      {#each items as item (rows[item.index]?.id ?? item.key)}
        {@const row = rows[item.index]}
        {#if row}
          {@const active = row.id === activeTrackId}
          {@const available = isTrackAvailable(row)}
          {@const action = trackRowAction(row, activeTrackId, playbackStatus)}
          {@const clickable = rowClickIntent(row, activeTrackId, playbackStatus) !== null}
          {@const run =
            action.kind === "pause"
              ? onpauseactive
              : action.kind === "resume"
                ? onresumeactive
                : () => onplaytrack(row.id)}
          {@const disabled = !available || run === undefined}
          <ContextMenuPrimitive.Root>
            <ContextMenuPrimitive.Trigger>
              {#snippet child({ props })}
                <!-- Clicking the row is a pointer shortcut; the action button is the keyboard path. -->
                <tr
                  {...props}
                  data-playback-state={active &&
                  (playbackStatus === "playing" || playbackStatus === "paused")
                    ? playbackStatus
                    : undefined}
                  data-availability={row.availability}
                  style:height="{TRACK_ROW_HEIGHT}px"
                  class={cn(
                    "group/track border-b border-border/70 text-foreground outline-none transition-colors hover:bg-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring",
                    clickable && "cursor-pointer",
                  )}
                  onclick={(event) => activateRow(event, row)}
                >
                  {#each columns as column (column.id)}
                    <TableCell
                      data-column-id={column.id}
                      class={cn(
                        "truncate px-3 py-0 last:text-right tabular-nums",
                        columnClass(column),
                      )}
                    >
                      {#if column.kind === "action"}
                        <div class="relative flex h-9 w-full items-center justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            class={cn(
                              "absolute transition-opacity",
                              !action.persistent &&
                                "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
                              disabled &&
                                !action.persistent &&
                                "pointer-events-none opacity-0 disabled:opacity-0",
                            )}
                            aria-label={action.label}
                            title={action.label}
                            {disabled}
                            onclick={(event) => {
                              event.stopPropagation();
                              run?.();
                            }}
                          >
                            <PlayPauseIcon playing={action.kind === "pause"} />
                          </Button>
                        </div>
                      {:else if column.kind === "title"}
                        <div class="min-w-0 text-left">
                          <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate" title={row.title}>{row.title}</span>
                            {#if row.availability === "missing"}
                              <span class="shrink-0 text-sm text-muted-foreground">Missing</span>
                            {/if}
                          </div>
                        </div>
                      {:else}
                        {@const text = columnText(column, row)}
                        <span title={text}>{text}</span>
                      {/if}
                    </TableCell>
                  {/each}
                </tr>
              {/snippet}
            </ContextMenuPrimitive.Trigger>
            <MenuContent>
              {#if available}
                <MenuItem onSelect={() => void playback.enqueueTrack(row.id, true)}>
                  Play next
                </MenuItem>
                <MenuItem onSelect={() => void playback.enqueueTrack(row.id, false)}>
                  Add to queue
                </MenuItem>
              {/if}
              {#if row.album}
                <MenuItem onSelect={() => goToAlbum(row)}>Go to album</MenuItem>
              {/if}
              {#if albumArtistOf(row) !== ""}
                <MenuItem onSelect={() => goToArtist(row)}>Go to artist</MenuItem>
              {/if}
              {#if row.availability === "available"}
                <MenuItem onSelect={() => void requireNative().revealLibraryTrack(row.id)}>
                  Show in Explorer
                </MenuItem>
              {/if}
              <MenuItem onSelect={() => (propertiesFor = row.id)}>Properties</MenuItem>
            </MenuContent>
          </ContextMenuPrimitive.Root>
        {/if}
      {/each}
      {#if bottomSpacer > 0}
        <tr aria-hidden="true">
          <td colspan={columns.length} class="p-0"
            ><div class="transition-none" style:height="{bottomSpacer}px"></div></td
          >
        </tr>
      {/if}
    </TableBody>
  </table>
  <TrackPropertiesSheet trackId={propertiesFor} onclose={() => (propertiesFor = null)} />
</div>
