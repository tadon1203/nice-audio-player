import type { ReactNode } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDuration } from "@/renderer/shared/lib/format-duration";
import type { TrackTableRow } from "./types";

const helper = createColumnHelper<TrackTableRow>();

export function createLibraryTrackColumns(
  renderAction: (row: TrackTableRow) => ReactNode,
  renderTitle: (row: TrackTableRow) => ReactNode,
): ColumnDef<TrackTableRow, any>[] {
  return [
    helper.display({
      id: "action",
      header: () => null,
      cell: ({ row }) => renderAction(row.original),
    }),
    helper.accessor("title", {
      header: () => "Title",
      cell: ({ row }) => renderTitle(row.original),
    }),
    helper.accessor("artist", {
      header: () => "Artist",
      cell: (info) => {
        const value = info.getValue() ?? "—";
        return <span title={value}>{value}</span>;
      },
    }),
    helper.accessor("album", {
      header: () => "Album",
      cell: (info) => {
        const value = info.getValue() ?? "—";
        return <span title={value}>{value}</span>;
      },
    }),
    helper.accessor("durationMs", {
      header: () => "Time",
      cell: (info) => formatDuration(info.getValue()),
    }),
  ];
}
