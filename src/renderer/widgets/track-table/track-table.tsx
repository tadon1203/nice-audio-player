import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { flexRender, getCoreRowModel, useReactTable, type ColumnMeta } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  toggleSortDirection,
  toNameSegment,
  trackSortLabels,
  type LibrarySortDirection,
  type LibraryTrackSortKey,
} from "@/renderer/entities/library";
import { usePlaybackActions } from "@/renderer/entities/playback";
import { cn } from "@/renderer/shared/lib/utils";
import { nativeApi } from "@/renderer/shared/lib/native";
import { ContextMenu, ContextMenuTrigger, MenuContent, MenuItem } from "@/renderer/shared/ui/menu";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/renderer/shared/ui/shadcn/table";
import { TRACK_ROW_HEIGHT, trackTableBreakpoints } from "./breakpoints";
import { albumTrackColumns, libraryTrackColumns } from "./track-columns";
import { TrackPropertiesSheet } from "./track-properties-sheet";
import { TrackTableContext, type TrackTableController } from "./track-table-context";
import type { TrackPlaybackStatus, TrackTableLayout, TrackTableRow } from "./types";

type TrackTableProps = {
  rows: TrackTableRow[];
  layout: TrackTableLayout;
  caption: string;
  activeTrackId?: string | null;
  playbackStatus?: TrackPlaybackStatus;
  sortKey?: LibraryTrackSortKey;
  sortDirection?: LibrarySortDirection;
  /**
   * The scroll element to virtualize rows against, or `null` while it is still mounting.
   * Omit it to render every row.
   */
  scrollElement?: HTMLElement | null;
  initialOffset?: number;
  /** Told the index of the first row in view, for the scroll index label. */
  onTopIndexChange?: (index: number) => void;
  onSortChange?: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
  onPlayTrack: (id: string) => void;
  onPauseActive?: () => void;
  onResumeActive?: () => void;
};

export function TrackTable({
  rows,
  layout,
  caption,
  activeTrackId = null,
  playbackStatus = "stopped",
  sortKey,
  sortDirection = "ascending",
  scrollElement,
  initialOffset,
  onTopIndexChange,
  onSortChange,
  onPlayTrack,
  onPauseActive,
  onResumeActive,
}: TrackTableProps) {
  const { enqueueTrack } = usePlaybackActions();
  const navigate = useNavigate();
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const controller = useMemo<TrackTableController>(
    () => ({
      layout,
      activeTrackId,
      playbackStatus,
      onPlayTrack,
      onPauseActive,
      onResumeActive,
    }),
    [activeTrackId, layout, onPauseActive, onPlayTrack, onResumeActive, playbackStatus],
  );
  const table = useReactTable({
    data: rows,
    columns: layout === "library" ? libraryTrackColumns : albumTrackColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const allRows = table.getRowModel().rows;
  const virtualized = scrollElement !== undefined;
  const virtualizer = useVirtualizer({
    count: virtualized ? allRows.length : 0,
    getScrollElement: () => scrollElement ?? null,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: 10,
    initialOffset,
  });
  const virtualRows = virtualized ? virtualizer.getVirtualItems() : [];
  const topIndex = virtualizer.range?.startIndex ?? 0;
  useEffect(() => {
    if (virtualized) onTopIndexChange?.(topIndex);
  }, [virtualized, topIndex, onTopIndexChange]);
  const visibleRows = virtualized ? virtualRows.map((item) => allRows[item.index]!) : allRows;
  const topSpacer = virtualized ? (virtualRows[0]?.start ?? 0) : 0;
  const bottomSpacer = virtualized
    ? virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
    : 0;
  const columnCount = table.getVisibleLeafColumns().length;
  // An album on several discs is split by a "Disc n" row. Only in the plain (unvirtualized)
  // album layout, where every row has the same height.
  const multiDisc = !virtualized && layout === "album" && rows.some((r) => (r.discNumber ?? 1) > 1);

  return (
    <TrackTableContext value={controller}>
      <div className="@container/track-table min-w-0">
        <Table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} className={columnClassName(column.columnDef.meta, true)} />
            ))}
          </colgroup>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="acrylic sticky top-0 z-10 text-left text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="h-9 border-b border-border">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const key = layout === "library" ? meta?.sortKey : undefined;
                  const active = key !== undefined && key === sortKey;
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-column-id={header.column.id}
                      className={cn("px-3 font-medium last:text-right", columnClassName(meta))}
                      aria-sort={active ? sortDirection : undefined}
                    >
                      {key && onSortChange ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-mx-2 h-8 px-2 text-sm"
                          aria-label={`Sort by ${trackSortLabels[key]}`}
                          onClick={() =>
                            onSortChange(
                              key,
                              active ? toggleSortDirection(sortDirection) : "ascending",
                            )
                          }
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {active ? (
                            sortDirection === "ascending" ? (
                              <ArrowUp aria-hidden="true" />
                            ) : (
                              <ArrowDown aria-hidden="true" />
                            )
                          ) : null}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {topSpacer > 0 ? <SpacerRow height={topSpacer} columns={columnCount} /> : null}
            {visibleRows.map((row) => {
              const original = row.original;
              const active = original.id === activeTrackId;
              const rowActionAvailable =
                original.playable &&
                original.availability === "available" &&
                (!active || playbackStatus !== "playing");
              const queueable = original.playable && original.availability === "available";
              const previousDisc = allRows[row.index - 1]?.original.discNumber;
              const discHeader =
                multiDisc && original.discNumber != null && original.discNumber !== previousDisc;
              return (
                <Fragment key={row.id}>
                  {discHeader ? (
                    <TableRow className="border-b border-border/70">
                      <TableCell
                        colSpan={columnCount}
                        className="px-3 pt-6 pb-2 text-sm text-muted-foreground"
                      >
                        Disc {original.discNumber}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={
                        <TableRow
                          data-playback-state={
                            active && (playbackStatus === "playing" || playbackStatus === "paused")
                              ? playbackStatus
                              : undefined
                          }
                          data-availability={original.availability}
                          style={{ height: TRACK_ROW_HEIGHT }}
                          className={cn(
                            "group/track border-b border-border/70 text-foreground outline-none transition-colors hover:bg-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring",
                            rowActionAvailable && "cursor-pointer",
                          )}
                          onClick={(event) => {
                            if (isInteractiveTarget(event)) return;
                            activateRow(
                              original,
                              active,
                              playbackStatus,
                              onPlayTrack,
                              onResumeActive,
                            );
                          }}
                        />
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          data-column-id={cell.column.id}
                          className={cn(
                            "truncate px-3 last:text-right tabular-nums",
                            columnClassName(cell.column.columnDef.meta),
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </ContextMenuTrigger>
                    <MenuContent side="bottom" align="start" className="min-w-44">
                      {queueable ? (
                        <>
                          <MenuItem onClick={() => void enqueueTrack(original.id, true)}>
                            Play next
                          </MenuItem>
                          <MenuItem onClick={() => void enqueueTrack(original.id, false)}>
                            Add to queue
                          </MenuItem>
                        </>
                      ) : null}
                      {layout === "library" && original.album ? (
                        <MenuItem
                          onClick={() =>
                            void navigate({
                              to: "/library/albums/$albumArtist/$albumTitle",
                              params: {
                                albumArtist: toNameSegment(albumArtistOf(original)),
                                albumTitle: toNameSegment(original.album!.trim()),
                              },
                            })
                          }
                        >
                          Go to album
                        </MenuItem>
                      ) : null}
                      {layout === "library" && albumArtistOf(original) !== "" ? (
                        <MenuItem
                          onClick={() =>
                            void navigate({
                              to: "/library/album-artists/$artistName",
                              params: { artistName: toNameSegment(albumArtistOf(original)) },
                            })
                          }
                        >
                          Go to artist
                        </MenuItem>
                      ) : null}
                      {original.availability === "available" ? (
                        <MenuItem onClick={() => void nativeApi().revealLibraryTrack(original.id)}>
                          Show in Explorer
                        </MenuItem>
                      ) : null}
                      <MenuItem onClick={() => setPropertiesFor(original.id)}>Properties</MenuItem>
                    </MenuContent>
                  </ContextMenu>
                </Fragment>
              );
            })}
            {bottomSpacer > 0 ? <SpacerRow height={bottomSpacer} columns={columnCount} /> : null}
          </TableBody>
        </Table>
        <TrackPropertiesSheet trackId={propertiesFor} onClose={() => setPropertiesFor(null)} />
      </div>
    </TrackTableContext>
  );
}

/** The artist the library groups the track under: album artist, else artist. */
function albumArtistOf(row: TrackTableRow) {
  return row.albumArtist?.trim() || row.artist?.trim() || "";
}

/** Width (for `<col>` only) and breakpoint visibility from one column definition. */
function columnClassName(meta: ColumnMeta<TrackTableRow, unknown> | undefined, withWidth = false) {
  return cn(
    withWidth && meta?.width,
    meta?.hideBelow && trackTableBreakpoints[meta.hideBelow].hide,
  );
}

function SpacerRow({ height, columns }: { height: number; columns: number }) {
  return (
    <TableRow aria-hidden="true" style={{ height }}>
      <TableCell colSpan={columns} className="p-0" />
    </TableRow>
  );
}

function activateRow(
  row: TrackTableRow,
  active: boolean,
  playbackStatus: TrackPlaybackStatus,
  onPlayTrack: (id: string) => void,
  onResumeActive?: () => void,
) {
  if (!row.playable || row.availability !== "available") return;
  if (active && playbackStatus === "playing") return;
  if (active && playbackStatus === "paused") {
    onResumeActive?.();
    return;
  }
  onPlayTrack(row.id);
}

function isInteractiveTarget(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest("button, a, input, select, textarea, [role='button'], [data-row-action]") !==
      null
  );
}
