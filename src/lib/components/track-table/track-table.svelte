<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { goto } from "$app/navigation";
  import { albumArtistHref, albumHref } from "$lib/library/routes";
  import { toggleSortDirection, trackSortLabels } from "$lib/library/sort";
  import type { LibrarySortDirection, LibraryTrackSortKey } from "$lib/native";
  import { requireNative } from "$lib/native";
  import { getPlayback } from "$lib/playback/context";
  import ContextMenuContent from "$lib/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "$lib/ui/context-menu/context-menu-item.svelte";
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
  import { createVirtualRows } from "$lib/ui/virtual-rows.svelte";
  import {
    albumArtistOf,
    columnText,
    isFilePresent,
    isTrackAvailable,
    libraryTrackColumns,
    trackRowState,
    trackTableBreakpoints,
    TRACK_ROW_HEIGHT,
    type TrackColumn,
    type TrackTableRow,
  } from "./track-columns";
  import TrackPropertiesSheet from "./track-properties-sheet.svelte";

  let {
    rows,
    caption,
    scrollElement,
    initialOffset = 0,
    ontopindexchange,
    sortKey,
    sortDirection = "ascending",
    onsortchange,
    onplaytrack,
  }: {
    rows: readonly TrackTableRow[];
    caption: string;
    /** The region the table scrolls in (`null` while it is still mounting). */
    scrollElement: HTMLElement | null;
    initialOffset?: number;
    /** Told the index of the first row in view, for the scroll index label. */
    ontopindexchange?: (index: number) => void;
    sortKey?: LibraryTrackSortKey;
    sortDirection?: LibrarySortDirection;
    onsortchange?: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
    /** Starts playback of this track in the page's context; pause and resume go straight to playback. */
    onplaytrack: (id: string) => void;
  } = $props();

  const columns = libraryTrackColumns;
  const playback = getPlayback();

  let propertiesFor = $state<string | null>(null);
  let container = $state<HTMLElement | null>(null);
  let body = $state<HTMLElement | null>(null);

  const virtual = createVirtualRows({
    count: () => rows.length,
    scrollElement: () => scrollElement,
    rowHeight: TRACK_ROW_HEIGHT,
    overscan: 10,
    initialOffset: () => initialOffset,
    container: () => container,
    body: () => body,
  });
  $effect(() => ontopindexchange?.(virtual.topIndex));

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

  function activateRow(event: MouseEvent, row: TrackTableRow, intent: "play" | "resume" | null) {
    if (isInteractiveTarget(event)) return;
    if (intent === "play") onplaytrack(row.id);
    else if (intent === "resume") void playback.resume();
  }

  // Plain strings from routes.ts, not resolve(): see there.
  function goToAlbum(row: TrackTableRow) {
    if (!row.album) return;
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(albumHref(albumArtistOf(row), row.album.trim()));
  }

  function goToArtist(row: TrackTableRow) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(albumArtistHref(albumArtistOf(row)));
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
      {#if virtual.topSpacer > 0}
        <tr aria-hidden="true">
          <td colspan={columns.length} class="p-0"
            ><div class="transition-none" style:height="{virtual.topSpacer}px"></div></td
          >
        </tr>
      {/if}
      {#each virtual.items as item (rows[item.index]?.id ?? item.key)}
        {@const row = rows[item.index]}
        {#if row}
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
          <ContextMenuPrimitive.Root>
            <ContextMenuPrimitive.Trigger>
              {#snippet child({ props })}
                <!-- Clicking the row is a pointer shortcut; the action button is the keyboard path. -->
                <tr
                  {...props}
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
                        <div class="relative flex h-9 w-full items-center justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            class={cn(
                              "absolute transition-opacity",
                              !action.persistent &&
                                "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
                              !available &&
                                !action.persistent &&
                                "pointer-events-none opacity-0 disabled:opacity-0",
                            )}
                            aria-label={action.label}
                            title={action.label}
                            disabled={!available}
                            onclick={(event) => {
                              event.stopPropagation();
                              runAction();
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
                      {:else if column.kind === "text"}
                        {@const text = columnText(column, row)}
                        <span title={text}>{text}</span>
                      {/if}
                    </TableCell>
                  {/each}
                </tr>
              {/snippet}
            </ContextMenuPrimitive.Trigger>
            <ContextMenuContent>
              {#if available}
                <ContextMenuItem onSelect={() => void playback.enqueueTrack(row.id, true)}>
                  Play next
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void playback.enqueueTrack(row.id, false)}>
                  Add to queue
                </ContextMenuItem>
              {/if}
              {#if row.album}
                <ContextMenuItem onSelect={() => goToAlbum(row)}>Go to album</ContextMenuItem>
              {/if}
              {#if albumArtistOf(row) !== ""}
                <ContextMenuItem onSelect={() => goToArtist(row)}>Go to artist</ContextMenuItem>
              {/if}
              {#if isFilePresent(row)}
                <ContextMenuItem onSelect={() => void requireNative().revealLibraryTrack(row.id)}>
                  Show in Explorer
                </ContextMenuItem>
              {/if}
              <ContextMenuItem onSelect={() => (propertiesFor = row.id)}>Properties</ContextMenuItem
              >
            </ContextMenuContent>
          </ContextMenuPrimitive.Root>
        {/if}
      {/each}
      {#if virtual.bottomSpacer > 0}
        <tr aria-hidden="true">
          <td colspan={columns.length} class="p-0"
            ><div class="transition-none" style:height="{virtual.bottomSpacer}px"></div></td
          >
        </tr>
      {/if}
    </TableBody>
  </table>
  <TrackPropertiesSheet trackId={propertiesFor} onclose={() => (propertiesFor = null)} />
</div>
