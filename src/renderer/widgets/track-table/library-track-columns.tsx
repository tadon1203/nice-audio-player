import type { ReactNode } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDuration } from "@/renderer/shared/lib/format-duration";
import type { TrackTableRow } from "./types";

const helper = createColumnHelper<TrackTableRow>();

export function createLibraryTrackColumns(
  renderTitle: (row: TrackTableRow) => ReactNode,
): ColumnDef<TrackTableRow, any>[] {
  return [
    helper.accessor("title", {
      header: () => "Title",
      cell: ({ row }) => renderTitle(row.original),
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
  ];
}
