import { useMemo, type MouseEvent, type RefObject } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import {
  toggleSortDirection,
  trackSortLabels,
  type LibrarySortDirection,
  type LibraryTrackSortKey,
} from "@/renderer/entities/library";
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
import { cn } from "@/renderer/shared/lib/utils";
import { createAlbumTrackColumns } from "./album-track-columns";
import { createLibraryTrackColumns } from "./library-track-columns";
import type { TrackTableRow } from "./types";

type TrackTableProps = {
  rows: readonly TrackTableRow[];
  layout: "library" | "album";
  caption: string;
  activeTrackId?: string | null;
  playbackStatus?: "stopped" | "playing" | "paused" | "failed";
  sortKey?: LibraryTrackSortKey;
  sortDirection?: LibrarySortDirection;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  initialOffset?: number;
  onSortChange?: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
  onPlayTrack: (id: string) => void;
  onPauseActive?: () => void;
  onResumeActive?: () => void;
};

export function TrackTable({
  rows,
  layout,
  caption,
  activeTrackId,
  playbackStatus = "stopped",
  sortKey,
  sortDirection = "ascending",
  scrollContainerRef,
  initialOffset,
  onSortChange,
  onPlayTrack,
  onPauseActive,
  onResumeActive,
}: TrackTableProps) {
  const columns = useMemo(() => {
    const renderAction = (row: TrackTableRow) => (
      <TrackAction
        row={row}
        layout={layout}
        active={row.id === activeTrackId}
        playbackStatus={playbackStatus}
        onPlayTrack={onPlayTrack}
        onPauseActive={onPauseActive}
        onResumeActive={onResumeActive}
      />
    );
    const renderTitle = (row: TrackTableRow) => <TrackTitle row={row} layout={layout} />;
    return layout === "library"
      ? createLibraryTrackColumns(renderAction, renderTitle)
      : createAlbumTrackColumns(renderAction, renderTitle);
  }, [activeTrackId, layout, onPauseActive, onPlayTrack, onResumeActive, playbackStatus]);
  const data = useMemo(() => [...rows], [rows]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const allRows = table.getRowModel().rows;
  const shouldVirtualize =
    layout === "library" && allRows.length > 100 && scrollContainerRef !== undefined;
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? allRows.length : 0,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 44,
    overscan: 10,
    initialOffset,
  });
  const virtualRows = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const visibleRows = shouldVirtualize ? virtualRows.map((item) => allRows[item.index]!) : allRows;
  const topSpacer = shouldVirtualize ? (virtualRows[0]?.start ?? 0) : 0;
  const bottomSpacer = shouldVirtualize
    ? virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
    : 0;

  return (
    <div className="@container/track-table min-w-0">
      <Table className="w-full table-fixed border-collapse text-sm" aria-label={caption}>
        <TrackColumnWidths layout={layout} />
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="sticky top-0 z-10 bg-background text-left text-muted-foreground">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="h-9 border-b border-border">
              {group.headers.map((header) => {
                const key = layout === "library" ? sortKeyForColumnId(header.column.id) : undefined;
                const active = key !== undefined && key === sortKey;
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    data-column-id={header.column.id}
                    className={cn(
                      "px-3 font-medium last:text-right",
                      columnVisibilityClass(layout, header.column.id),
                    )}
                    aria-sort={
                      active
                        ? sortDirection === "ascending"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
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
                            <ArrowUp aria-hidden="true" className="size-4" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="size-4" />
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
          {topSpacer > 0 ? <SpacerRow height={topSpacer} columns={columns.length} /> : null}
          {visibleRows.map((row) => {
            const original = row.original;
            const active = original.id === activeTrackId;
            const rowActionAvailable =
              original.playable &&
              original.availability === "available" &&
              (!active || playbackStatus !== "playing");
            return (
              <TableRow
                key={row.id}
                data-playback-state={
                  active && (playbackStatus === "playing" || playbackStatus === "paused")
                    ? playbackStatus
                    : undefined
                }
                data-availability={original.availability}
                className={cn(
                  "group/track h-11 border-b border-border/70 text-foreground outline-none transition-colors hover:bg-accent/40 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring data-[playback-state=playing]:bg-accent/60 data-[playback-state=paused]:bg-muted",
                  rowActionAvailable && "cursor-pointer",
                )}
                onClick={(event) => {
                  if (isInteractiveTarget(event)) return;
                  activateRow(original, active, playbackStatus, onPlayTrack, onResumeActive);
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    data-column-id={cell.column.id}
                    className={cn(
                      "truncate px-3 last:text-right tabular-nums",
                      columnVisibilityClass(layout, cell.column.id),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {bottomSpacer > 0 ? <SpacerRow height={bottomSpacer} columns={columns.length} /> : null}
        </TableBody>
      </Table>
    </div>
  );
}

function TrackColumnWidths({ layout }: { layout: TrackTableProps["layout"] }) {
  return layout === "library" ? (
    <colgroup>
      <col className="w-10" />
      <col />
      <col className="w-32" />
      <col className="w-32" />
      <col className="w-20" />
    </colgroup>
  ) : (
    <colgroup>
      <col className="w-12" />
      <col />
      <col className="w-36 @max-[600px]/track-table:hidden" />
      <col className="w-24 @max-[760px]/track-table:hidden" />
      <col className="w-36 @max-[760px]/track-table:hidden" />
      <col className="w-20" />
    </colgroup>
  );
}

function SpacerRow({ height, columns }: { height: number; columns: number }) {
  return (
    <TableRow aria-hidden="true" style={{ height }}>
      <TableCell colSpan={columns} className="p-0" />
    </TableRow>
  );
}

function TrackAction({
  row,
  layout,
  active,
  playbackStatus,
  onPlayTrack,
  onPauseActive,
  onResumeActive,
}: {
  row: TrackTableRow;
  layout: TrackTableProps["layout"];
  active: boolean;
  playbackStatus: TrackTableProps["playbackStatus"];
  onPlayTrack: (id: string) => void;
  onPauseActive?: () => void;
  onResumeActive?: () => void;
}) {
  const available = row.playable && row.availability === "available";
  const action =
    active && playbackStatus === "playing"
      ? { label: `Pause ${row.title}`, run: onPauseActive, icon: Pause, persistent: true }
      : active && playbackStatus === "paused"
        ? { label: `Resume ${row.title}`, run: onResumeActive, icon: Play, persistent: true }
        : {
            label: `Play ${row.title}`,
            run: () => onPlayTrack(row.id),
            icon: Play,
            persistent: false,
          };
  const Icon = action.icon;
  const disabled = !available || action.run === undefined;

  return (
    <div className="relative flex h-9 w-full items-center justify-center">
      {layout === "album" ? (
        <span
          aria-hidden="true"
          className={cn(
            "text-sm text-muted-foreground transition-opacity",
            available &&
              !action.persistent &&
              "group-hover/track:opacity-0 group-focus-within/track:opacity-0",
            action.persistent && "opacity-0",
          )}
        >
          {row.trackNumber ?? "—"}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          "absolute size-9 transition-opacity",
          !action.persistent &&
            "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
          disabled && !action.persistent && "pointer-events-none opacity-0",
        )}
        aria-label={action.label}
        title={action.label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          action.run?.();
        }}
      >
        <Icon aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function TrackTitle({ row, layout }: { row: TrackTableRow; layout: TrackTableProps["layout"] }) {
  return (
    <div className="min-w-0 text-left">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate" title={row.title}>
          {row.title}
        </span>
        {row.availability === "missing" ? (
          <span className="shrink-0 text-sm text-muted-foreground">Missing</span>
        ) : null}
      </div>
      {layout === "album" && row.artist ? (
        <span
          className="mt-0.5 hidden truncate text-sm text-muted-foreground @max-[600px]/track-table:block"
          title={row.artist}
        >
          {row.artist}
        </span>
      ) : null}
    </div>
  );
}

function activateRow(
  row: TrackTableRow,
  active: boolean,
  playbackStatus: TrackTableProps["playbackStatus"],
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

function columnVisibilityClass(layout: TrackTableProps["layout"], id: string) {
  if (layout !== "album") return undefined;
  if (id === "artist") return "@max-[600px]/track-table:hidden";
  if (id === "fileFormat" || id === "sampleRate") return "@max-[760px]/track-table:hidden";
  return undefined;
}

function sortKeyForColumnId(id: string): LibraryTrackSortKey | undefined {
  switch (id) {
    case "title":
    case "artist":
    case "album":
      return id;
    case "durationMs":
      return "duration";
    default:
      return undefined;
  }
}
