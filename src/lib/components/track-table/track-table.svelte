<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { goto } from "$app/navigation";
  import { isFilePresent, isTrackAvailable, trackLinks } from "$lib/library/tracks";
  import type { LibrarySortDirection, LibraryTrackSortKey } from "$lib/native";
  import { requireNative } from "$lib/native";
  import { getPlayback } from "$lib/playback/context";
  import ContextMenuContent from "$lib/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "$lib/ui/context-menu/context-menu-item.svelte";
  import {
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/ui/shadcn/table";
  import { cn } from "$lib/utils/cn.js";
  import { createVirtualRows } from "$lib/ui/virtual-rows.svelte";
  import {
    columnText,
    albumTrackColumns,
    libraryTrackColumns,
    hasSeveralDiscs,
    startsDisc,
    trackRowState,
    trackTableBreakpoints,
    TRACK_ROW_HEIGHT,
    type TrackColumn,
    type TrackTableLayout,
    type TrackTableRow,
  } from "./track-columns";
  import TrackActionCell from "./track-action-cell.svelte";
  import TrackPropertiesSheet from "./track-properties-sheet.svelte";
  import TrackSortHeader from "./track-sort-header.svelte";

  let {
    rows,
    caption,
    layout = "library",
    scrollElement,
    ontopindexchange,
    sortKey,
    sortDirection = "ascending",
    onsortchange,
    onplaytrack,
  }: {
    rows: readonly TrackTableRow[];
    caption: string;
    layout?: TrackTableLayout;
    /**
     * The region the table scrolls in to virtualize its rows against (`null` while it is still
     * mounting). Omit it to render every row.
     */
    scrollElement?: HTMLElement | null;
    /** Told the index of the first row in view, for the scroll index label. */
    ontopindexchange?: (index: number) => void;
    sortKey?: LibraryTrackSortKey;
    sortDirection?: LibrarySortDirection;
    onsortchange?: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
    /** Starts playback of this track in the page's context; pause and resume go straight to playback. */
    onplaytrack: (id: string) => void;
  } = $props();

  const columns = $derived(layout === "library" ? libraryTrackColumns : albumTrackColumns);
  const virtualized = $derived(scrollElement !== undefined);
  const playback = getPlayback();

  let propertiesFor = $state<string | null>(null);
  let menuRow = $state<TrackTableRow | null>(null);
  let container = $state<HTMLElement | null>(null);
  let body = $state<HTMLElement | null>(null);

  const virtual = createVirtualRows({
    count: () => rows.length,
    scrollElement: () => scrollElement ?? null,
    rowHeight: TRACK_ROW_HEIGHT,
    overscan: 10,
    container: () => container,
    body: () => body,
  });
  $effect(() => {
    if (virtualized) ontopindexchange?.(virtual.topIndex);
  });

  const visibleIndexes = $derived(
    virtualized ? virtual.items.map((item) => item.index) : rows.map((_, index) => index),
  );
  const topSpacer = $derived(virtualized ? virtual.topSpacer : 0);
  const bottomSpacer = $derived(virtualized ? virtual.bottomSpacer : 0);
  // An album on several discs is split by a "Disc n" row. Only in the plain (unvirtualized)
  // album layout, where every row has the same height.
  const splitsDiscs = $derived(!virtualized && layout === "album" && hasSeveralDiscs(rows));

  /** Width (for `<col>` only) and breakpoint visibility from one column definition. */
  function columnClass(column: TrackColumn, withWidth = false) {
    return cn(
      withWidth && column.width,
      column.hideBelow && trackTableBreakpoints[column.hideBelow].hide,
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

  function activateRow(event: MouseEvent, row: TrackTableRow, intent: "play" | "resume" | null) {
    if (isInteractiveTarget(event)) return;
    if (intent === "play") onplaytrack(row.id);
    else if (intent === "resume") void playback.resume();
  }

  /** Resolves the row under a right-click; the spacer rows have none, so no menu opens there. */
  function selectMenuRow(event: MouseEvent) {
    const target = event.target;
    const id =
      target instanceof Element
        ? (target.closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId ?? null)
        : null;
    const row = id === null ? undefined : rows.find((candidate) => candidate.id === id);
    if (row) menuRow = row;
    else event.stopPropagation();
  }

  // Plain strings from routes.ts, not resolve(): see there.
  function goTo(href: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(href);
  }
</script>

<div bind:this={container} class="@container/track-table min-w-0">
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
          {@const key = layout === "library" ? column.sortKey : undefined}
          {@const active = key !== undefined && key === sortKey}
          <TableHead
            scope="col"
            data-column-id={column.id}
            class={cn("px-3 font-medium last:text-right", columnClass(column))}
            aria-sort={active ? sortDirection : undefined}
          >
            {#if key !== undefined && onsortchange}
              <TrackSortHeader
                header={column.header}
                sortKey={key}
                {active}
                direction={sortDirection}
                {onsortchange}
              />
            {:else}
              {column.header}
            {/if}
          </TableHead>
        {/each}
      </TableRow>
    </TableHeader>
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger>
        {#snippet child({ props })}
          <TableBody {...props} bind:ref={body} oncontextmenucapture={selectMenuRow}>
            <!-- Spacer heights must jump, never animate: the reduced-motion rule gives every element a
           transition, and a lagging spacer puts the rows in the wrong place. -->
            {#if topSpacer > 0}
              <tr aria-hidden="true">
                <td colspan={columns.length} class="p-0"
                  ><div class="transition-none" style:height="{topSpacer}px"></div></td
                >
              </tr>
            {/if}
            {#each visibleIndexes as index (rows[index]?.id ?? index)}
              {@const row = rows[index]}
              {#if row}
                {#if splitsDiscs && startsDisc(rows, index)}
                  <TableRow class="border-b border-border/70">
                    <TableCell
                      colspan={columns.length}
                      class="px-3 pt-6 pb-2 text-sm text-muted-foreground"
                    >
                      Disc {row.discNumber}
                    </TableCell>
                  </TableRow>
                {/if}
                {@const { action, clickIntent, playbackState } = trackRowState(
                  row,
                  playback.activeTrackId,
                  playback.status,
                )}
                {@const available = isTrackAvailable(row)}
                {@const runAction = {
                  play: () => onplaytrack(row.id),
                  pause: () => void playback.pause(),
                  resume: () => void playback.resume(),
                }[action.kind]}
                <!-- Clicking the row is a pointer shortcut; the action button is the keyboard path. -->
                <tr
                  data-row-id={row.id}
                  data-playback-state={playbackState}
                  data-availability={row.availability}
                  style:height="{TRACK_ROW_HEIGHT}px"
                  class={cn(
                    "group/track border-b border-border/70 text-foreground outline-none transition-colors hover:bg-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring",
                    clickIntent !== null && "cursor-pointer",
                  )}
                  onclick={(event) => activateRow(event, row, clickIntent)}
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
                        <TrackActionCell {row} {action} {available} {layout} run={runAction} />
                      {:else if column.kind === "title"}
                        <div class="min-w-0 text-left">
                          <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate" title={row.title}>{row.title}</span>
                            {#if row.availability === "missing"}
                              <span class="shrink-0 text-sm text-muted-foreground">Missing</span>
                            {/if}
                          </div>
                          {#if layout === "album" && row.artist}
                            <span
                              class={cn(
                                "mt-0.5 hidden truncate text-sm text-muted-foreground",
                                trackTableBreakpoints.compact.show,
                              )}
                              title={row.artist}>{row.artist}</span
                            >
                          {/if}
                        </div>
                      {:else if column.kind === "text"}
                        {@const text = columnText(column, row)}
                        <span title={text}>{text}</span>
                      {/if}
                    </TableCell>
                  {/each}
                </tr>
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
        {/snippet}
      </ContextMenuPrimitive.Trigger>
      <ContextMenuContent>
        {#if menuRow}
          {@const row = menuRow}
          {#if isTrackAvailable(row)}
            <ContextMenuItem onSelect={() => void playback.enqueueTrack(row.id, true)}>
              Play next
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void playback.enqueueTrack(row.id, false)}>
              Add to queue
            </ContextMenuItem>
          {/if}
          {#if layout === "library"}
            {@const links = trackLinks(row)}
            {#if links.album?.href}
              {@const href = links.album.href}
              <ContextMenuItem onSelect={() => goTo(href)}>Go to album</ContextMenuItem>
            {/if}
            {#if links.artist?.href}
              {@const href = links.artist.href}
              <ContextMenuItem onSelect={() => goTo(href)}>Go to artist</ContextMenuItem>
            {/if}
          {/if}
          {#if isFilePresent(row)}
            <ContextMenuItem onSelect={() => void requireNative().revealLibraryTrack(row.id)}>
              Show in Explorer
            </ContextMenuItem>
          {/if}
          <ContextMenuItem onSelect={() => (propertiesFor = row.id)}>Properties</ContextMenuItem>
        {/if}
      </ContextMenuContent>
    </ContextMenuPrimitive.Root>
  </table>
  <TrackPropertiesSheet trackId={propertiesFor} onclose={() => (propertiesFor = null)} />
</div>
