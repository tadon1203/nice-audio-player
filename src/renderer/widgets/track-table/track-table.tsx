import { useMemo, type RefObject } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import type { LibrarySortDirection, LibraryTrackSortKey } from "@/renderer/entities/library";
import { Button } from "@/renderer/shared/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/renderer/shared/ui/table";
import { formatDuration } from "@/renderer/shared/lib/format-duration";

export type TrackTableRow = {
  id: string;
  title: string;
  artist: string | null;
  album?: string | null;
  trackNumber?: number | null;
  fileFormat?: string | null;
  bitDepth?: number | null;
  sampleRate?: number | null;
  durationMs: number | null;
  availability: "available" | "missing";
  playable: boolean;
};

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

const helper = createColumnHelper<TrackTableRow>();

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
  const columns = useMemo<ColumnDef<TrackTableRow, any>[]>(
    () =>
      layout === "library"
        ? [
            helper.accessor("title", {
              header: () => "Title",
              cell: ({ row }) => (
                <TrackTitle
                  row={row.original}
                  active={row.original.id === activeTrackId}
                  playbackStatus={playbackStatus}
                  onPlayTrack={onPlayTrack}
                  onPauseActive={onPauseActive}
                  onResumeActive={onResumeActive}
                />
              ),
            }),
            helper.accessor("artist", {
              header: () => "Artist",
              cell: (info) => info.getValue() ?? "—",
            }),
            helper.accessor("album", {
              header: () => "Album",
              cell: (info) => info.getValue() ?? "—",
            }),
            helper.accessor("durationMs", {
              header: () => "Time",
              cell: (info) => formatDuration(info.getValue()),
            }),
          ]
        : [
            helper.accessor("trackNumber", {
              header: () => "#",
              cell: (info) => info.getValue() ?? "—",
            }),
            helper.accessor("title", {
              header: () => "Title",
              cell: ({ row }) => (
                <TrackTitle
                  row={row.original}
                  active={row.original.id === activeTrackId}
                  playbackStatus={playbackStatus}
                  onPlayTrack={onPlayTrack}
                  onPauseActive={onPauseActive}
                  onResumeActive={onResumeActive}
                />
              ),
            }),
            helper.accessor("fileFormat", {
              header: () => "Format",
              cell: (info) => info.getValue() ?? "—",
            }),
            helper.accessor("sampleRate", {
              header: () => "Quality",
              cell: ({ row }) => {
                const rate = row.original.sampleRate;
                const depth = row.original.bitDepth;
                return rate
                  ? `${(rate / 1000).toFixed(1)} kHz${depth ? ` · ${depth}-bit` : ""}`
                  : "—";
              },
            }),
            helper.accessor("durationMs", {
              header: () => "Time",
              cell: (info) => formatDuration(info.getValue()),
            }),
          ],
    [activeTrackId, layout, onPauseActive, onPlayTrack, onResumeActive, playbackStatus],
  );
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
    <div className="contents">
      <Table className="w-full table-fixed border-collapse text-sm" aria-label={caption}>
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
                    className="px-3 font-medium first:w-[42%] last:w-24 last:text-right"
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
                        aria-label={`Sort by ${trackColumnLabel(key)}`}
                        onClick={() =>
                          onSortChange(
                            key,
                            active && sortDirection === "ascending" ? "descending" : "ascending",
                          )
                        }
                      >
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
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
          {visibleRows.map((row) => (
            <TableRow
              key={row.id}
              data-playback-state={
                row.original.id === activeTrackId &&
                (playbackStatus === "playing" || playbackStatus === "paused")
                  ? playbackStatus
                  : undefined
              }
              data-availability={row.original.availability}
              className="h-11 border-b border-border/70 text-foreground hover:bg-accent/40 data-[playback-state=playing]:bg-accent/60 data-[playback-state=paused]:bg-muted"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="truncate px-3 last:text-right tabular-nums">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {bottomSpacer > 0 ? <SpacerRow height={bottomSpacer} columns={columns.length} /> : null}
        </TableBody>
      </Table>
    </div>
  );
}

function SpacerRow({ height, columns }: { height: number; columns: number }) {
  return (
    <TableRow aria-hidden="true" style={{ height }}>
      <TableCell colSpan={columns} className="p-0" />
    </TableRow>
  );
}

function TrackTitle({
  row,
  active,
  playbackStatus,
  onPlayTrack,
  onPauseActive,
  onResumeActive,
}: {
  row: TrackTableRow;
  active: boolean;
  playbackStatus: TrackTableProps["playbackStatus"];
  onPlayTrack: (id: string) => void;
  onPauseActive?: () => void;
  onResumeActive?: () => void;
}) {
  const action =
    active && playbackStatus === "playing"
      ? { label: `Pause ${row.title}`, run: onPauseActive }
      : active && playbackStatus === "paused"
        ? { label: `Resume ${row.title}`, run: onResumeActive }
        : { label: `Play ${row.title}`, run: () => onPlayTrack(row.id) };

  return (
    <Button
      type="button"
      variant="ghost"
      className="-mx-2 h-9 max-w-full justify-start gap-2 px-2 font-normal"
      aria-label={action.label}
      disabled={!row.playable || row.availability !== "available" || action.run === undefined}
      onClick={() => action.run?.()}
    >
      {active && playbackStatus === "playing" ? (
        <Pause aria-hidden="true" className="size-4 shrink-0" />
      ) : active && playbackStatus === "paused" ? (
        <Play aria-hidden="true" className="size-4 shrink-0" />
      ) : null}
      <span className="truncate">{row.title}</span>
      {row.availability === "missing" ? (
        <span className="shrink-0 text-sm text-muted-foreground">Missing</span>
      ) : null}
    </Button>
  );
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

function trackColumnLabel(key: LibraryTrackSortKey) {
  switch (key) {
    case "title":
      return "Title";
    case "artist":
      return "Artist";
    case "album":
      return "Album";
    case "duration":
      return "Time";
  }
}
