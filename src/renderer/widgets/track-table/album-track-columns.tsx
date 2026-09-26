import type { ReactNode } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDuration } from "@/renderer/shared/lib/format-duration";
import type { TrackTableRow } from "./types";

const helper = createColumnHelper<TrackTableRow>();

export function createAlbumTrackColumns(
  renderAction: (row: TrackTableRow) => ReactNode,
  renderTitle: (row: TrackTableRow) => ReactNode,
): ColumnDef<TrackTableRow, any>[] {
  return [
    helper.display({
      id: "action",
      header: () => "#",
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
    helper.accessor("fileFormat", {
      header: () => "Format",
      cell: (info) => info.getValue() ?? "—",
    }),
    helper.accessor("sampleRate", {
      header: () => "Quality",
      cell: ({ row }) => {
        const rate = row.original.sampleRate;
        const depth = row.original.bitDepth;
        return rate ? `${(rate / 1000).toFixed(1)} kHz${depth ? ` · ${depth}-bit` : ""}` : "—";
      },
    }),
    helper.accessor("durationMs", {
      header: () => "Time",
      cell: (info) => formatDuration(info.getValue()),
    }),
  ];
}
