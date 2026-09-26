import { createColumnHelper, type ColumnDef, type RowData } from "@tanstack/react-table";
import type { LibraryTrackSortKey } from "@/renderer/entities/library";
import { MISSING, formatDuration, formatSampleRate } from "@/renderer/shared/lib/format";
import type { TrackTableBreakpoint } from "./breakpoints";
import { TrackAction, TrackText, TrackTitle } from "./track-cells";
import type { TrackTableRow } from "./types";

declare module "@tanstack/react-table" {
  // The type parameters must match the library declaration; `_row` and `_value` use them.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Tailwind width class for the `<col>`; empty lets the column take the remaining width. */
    width: string;
    /** The container breakpoint below which the column is hidden. */
    hideBelow?: TrackTableBreakpoint;
    /** The sort key a header click requests, for columns the backend can sort by. */
    sortKey?: LibraryTrackSortKey;
    _row?: TData;
    _value?: TValue;
  }
}

const helper = createColumnHelper<TrackTableRow>();

// Every column is a display column: the table never sorts or filters itself, so
// values are read from the row directly and no column needs an untyped accessor.
const action = (header: string | null, width: string) =>
  helper.display({
    id: "action",
    header: () => header,
    cell: ({ row }) => <TrackAction row={row.original} />,
    meta: { width },
  });

const title = helper.display({
  id: "title",
  header: () => "Title",
  cell: ({ row }) => <TrackTitle row={row.original} />,
  meta: { width: "", sortKey: "title" },
});

const time = helper.display({
  id: "durationMs",
  header: () => "Time",
  cell: ({ row }) => formatDuration(row.original.durationMs),
  meta: { width: "w-20", sortKey: "duration" },
});

const artist = (width: string, hideBelow?: TrackTableBreakpoint, sortable = false) =>
  helper.display({
    id: "artist",
    header: () => "Artist",
    cell: ({ row }) => <TrackText value={row.original.artist} />,
    meta: { width, hideBelow, sortKey: sortable ? "artist" : undefined },
  });

export const libraryTrackColumns: ColumnDef<TrackTableRow>[] = [
  action(null, "w-10"),
  title,
  artist("w-32", undefined, true),
  helper.display({
    id: "album",
    header: () => "Album",
    cell: ({ row }) => <TrackText value={row.original.album} />,
    meta: { width: "w-32", sortKey: "album" },
  }),
  time,
];

export const albumTrackColumns: ColumnDef<TrackTableRow>[] = [
  action("#", "w-12"),
  title,
  artist("w-36", "compact"),
  helper.display({
    id: "fileFormat",
    header: () => "Format",
    cell: ({ row }) => row.original.fileFormat ?? MISSING,
    meta: { width: "w-24", hideBelow: "narrow" },
  }),
  helper.display({
    id: "sampleRate",
    header: () => "Quality",
    cell: ({ row }) => {
      const { sampleRate, bitDepth } = row.original;
      if (!sampleRate) return MISSING;
      return `${formatSampleRate(sampleRate)}${bitDepth ? ` · ${bitDepth}-bit` : ""}`;
    },
    meta: { width: "w-36", hideBelow: "narrow" },
  }),
  time,
];
