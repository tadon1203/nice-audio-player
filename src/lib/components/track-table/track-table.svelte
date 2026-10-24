<script lang="ts">
  import { Root as ContextMenuRoot, Trigger as ContextMenuTrigger } from "#lib/ui/context-menu";
  import { Tracks } from "#lib/library/tracks";
  import { type SortDirection, type TrackSortKey, type TrackId } from "#lib/native/bindings";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import ContextMenuContent from "#lib/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "#lib/ui/context-menu/context-menu-item.svelte";
  import {
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/ui/shadcn/table";
  import { cn } from "#lib/utils/cn.js";
  import { VirtualRows } from "#lib/ui/virtual-rows.svelte";
  import { TrackColumns, type TrackTableLayout, type TrackTableRow } from "./track-columns";
  import { TrackDiscs } from "./track-discs";
  import { TrackRowStates } from "./track-row-states";
  import { TrackTableController } from "./track-table-controller.svelte";
  import TrackActionCell from "./track-action-cell.svelte";
  import TrackPropertiesSheet from "./track-properties-sheet.svelte";
  import TrackSortHeader from "./track-sort-header.svelte";

  let {
    rows,
    caption,
    layout = "library",
    virtualized = false,
    ontopindexchange,
    sortKey,
    sortDirection = "ascending",
    onsortchange,
    onplaytrack,
  }: {
    rows: readonly TrackTableRow[];
    caption: string;
    layout?: TrackTableLayout;
    /** Mounts only the rows near the view, in the scroll view above. Off renders every row. */
    virtualized?: boolean;
    /** Told the index of the first row in view, for the scroll index label. */
    ontopindexchange?: (index: number) => void;
    sortKey?: TrackSortKey;
    sortDirection?: SortDirection;
    onsortchange?: (key: TrackSortKey, direction: SortDirection) => void;
    /** Starts playback of this track in the page's context; pause and resume go straight to playback. */
    onplaytrack: (id: TrackId) => void;
  } = $props();

  const services = AppServices.current();
  const { playback } = services;
  const columns = $derived(TrackColumns.of(layout));
  const controller = new TrackTableController(
    services,
    () => rows,
    (id) => onplaytrack(id),
  );

  let propertiesFor = $state<TrackId | null>(null);

  const virtual = new VirtualRows({
    count: (): number => rows.length,
    rowHeight: TrackColumns.rowHeight,
    overscan: 10,
  });
  // The scroll index label is told the top row as the virtual rows scroll. The callback belongs to
  // the parent, so this stays an effect rather than an attachment.
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
  const splitsDiscs = $derived(!virtualized && layout === "album" && TrackDiscs.hasSeveral(rows));
</script>

<div class="@container/track-table min-w-0">
  <!-- Not the shadcn Table directory: its overflow wrapper would break the sticky header. -->
  <table class="w-full table-fixed border-collapse text-sm">
    <colgroup>
      {#each columns as column (column.id)}
        <col class={TrackColumns.classFor(column, true)} />
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
            class={cn("px-3 font-medium last:text-right", TrackColumns.classFor(column))}
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
    <ContextMenuRoot>
      <ContextMenuTrigger>
        {#snippet child({ props })}
          <TableBody
            {...props}
            {@attach virtual.attachBody}
            oncontextmenucapture={controller.onContextMenu}
          >
            <!-- Spacer heights must jump, never animate: the reduced-motion rule gives every element a
           transition, and a lagging spacer puts the rows in the wrong place. -->
            {#if topSpacer > 0}
              <tr aria-hidden="true">
                <td colspan={columns.length} class="p-0"
                  ><div class="transition-none" style:height="{topSpacer}px"></div></td
                >
              </tr>
            {/if}
            {#each visibleIndexes as index (rows[index]?.id ?? `placeholder-${index}`)}
              {@const row = rows[index]}
              {#if row}
                {#if splitsDiscs && TrackDiscs.starts(rows, index)}
                  <TableRow class="border-b border-border/70">
                    <TableCell
                      colspan={columns.length}
                      class="px-3 pt-6 pb-2 text-sm text-muted-foreground"
                    >
                      Disc {row.discNumber}
                    </TableCell>
                  </TableRow>
                {/if}
                {@const { action, clickIntent, playbackState } = TrackRowStates.of(
                  row,
                  playback.activeTrackId,
                  playback.status,
                )}
                {@const available = Tracks.isPlayable(row)}
                <!-- Clicking the row is a pointer shortcut. The action button is the keyboard path; the row's
                     Enter and Space handler only takes keys that reach the row itself. -->

                <tr
                  data-row-id={row.id}
                  data-playback-state={playbackState}
                  data-track-state={row.state}
                  style:height="{TrackColumns.rowHeight}px"
                  class={cn(
                    "group/track border-b border-border/70 text-foreground outline-none transition-colors hover:bg-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring",
                    clickIntent !== null && "cursor-pointer",
                  )}
                  onclick={(event) => controller.onRowClick(event, row.id)}
                  onkeydown={(event) => controller.onRowKeydown(event, row.id)}
                >
                  {#each columns as column (column.id)}
                    <TableCell
                      data-column-id={column.id}
                      class={cn(
                        "truncate px-3 py-0 last:text-right tabular-nums",
                        TrackColumns.classFor(column),
                      )}
                    >
                      {#if column.kind === "action"}
                        <TrackActionCell
                          {row}
                          {action}
                          {available}
                          {layout}
                          run={() => controller.runAction(row)}
                        />
                      {:else if column.kind === "title"}
                        <div class="min-w-0 text-left">
                          <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate" title={row.title}>{row.title}</span>
                            {#if row.state === "missing"}
                              <span class="shrink-0 text-sm text-muted-foreground">Missing</span>
                            {/if}
                          </div>
                          {#if layout === "album" && row.artist}
                            <span
                              class={cn(
                                "mt-0.5 hidden truncate text-sm text-muted-foreground",
                                TrackColumns.breakpoints.compact.show,
                              )}
                              title={row.artist}>{row.artist}</span
                            >
                          {/if}
                        </div>
                      {:else if column.kind === "text"}
                        {@const text = TrackColumns.columnText(column, row)}
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        {#if controller.menuTrack}
          {@const row = controller.menuTrack}
          {#if Tracks.isPlayable(row)}
            <ContextMenuItem onSelect={() => controller.playNext()}>Play next</ContextMenuItem>
            <ContextMenuItem onSelect={() => controller.addToQueue()}>Add to queue</ContextMenuItem>
          {/if}
          {#if layout === "library"}
            {@const links = Tracks.links(row)}
            {#if links.album?.href}
              {@const href = links.album.href}
              <ContextMenuItem onSelect={() => controller.navigate(href)}
                >Go to album</ContextMenuItem
              >
            {/if}
            {#if links.artist?.href}
              {@const href = links.artist.href}
              <ContextMenuItem onSelect={() => controller.navigate(href)}
                >Go to artist</ContextMenuItem
              >
            {/if}
          {/if}
          {#if Tracks.isFilePresent(row)}
            <ContextMenuItem onSelect={() => controller.reveal()}>Show in Explorer</ContextMenuItem>
          {/if}
          <ContextMenuItem onSelect={() => (propertiesFor = row.id)}>Properties</ContextMenuItem>
        {/if}
      </ContextMenuContent>
    </ContextMenuRoot>
  </table>
  <TrackPropertiesSheet
    trackId={propertiesFor}
    onclose={() => (propertiesFor = null)}
    onreveal={controller.revealTrack}
    oncopy={controller.copyPath}
  />
</div>
