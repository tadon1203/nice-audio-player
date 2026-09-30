import type { LibraryTrackSortKey, LibraryTrackSummary } from "$lib/native";
import { formatDuration, MISSING } from "$lib/utils/format";

/** A track row; the Library layout and (later) the Album layout both satisfy it. */
export type TrackTableRow = Pick<
  LibraryTrackSummary,
  "id" | "title" | "artist" | "album" | "albumArtist" | "durationMs" | "availability" | "playable"
>;

export type TrackPlaybackStatus = "stopped" | "playing" | "paused" | "failed";

/**
 * The container widths below which track table columns yield to the title. Header, cells and
 * `<col>` all read from here, so changing one breakpoint changes them together. The class names
 * are written out in full so Tailwind can see them.
 */
export const trackTableBreakpoints = {
  compact: "@max-[600px]/track-table:hidden",
  narrow: "@max-[760px]/track-table:hidden",
} as const;

export type TrackTableBreakpoint = keyof typeof trackTableBreakpoints;

/** Row height; rows are set to this explicitly so virtualization can place them by arithmetic. */
export const TRACK_ROW_HEIGHT = 40;

/**
 * One column: what it shows, how wide it is, below which container width it hides, and the
 * backend sort key a header click requests. The table never sorts or filters itself.
 */
export type TrackColumn = {
  id: string;
  /** Header text; `null` leaves the header empty (the action slot). */
  header: string | null;
  /** Tailwind width class for the `<col>`; empty lets the column take the remaining width. */
  width: string;
  hideBelow?: TrackTableBreakpoint;
  sortKey?: LibraryTrackSortKey;
} & (
  | { kind: "action" | "title" }
  | { kind: "text"; text: (row: TrackTableRow) => string | null | undefined }
);

export const libraryTrackColumns: readonly TrackColumn[] = [
  { id: "action", kind: "action", header: null, width: "w-10" },
  { id: "title", kind: "title", header: "Title", width: "", sortKey: "title" },
  {
    id: "artist",
    kind: "text",
    header: "Artist",
    width: "w-32",
    sortKey: "artist",
    text: (row) => row.artist,
  },
  {
    id: "album",
    kind: "text",
    header: "Album",
    width: "w-32",
    sortKey: "album",
    text: (row) => row.album,
  },
  {
    id: "durationMs",
    kind: "text",
    header: "Time",
    width: "w-20",
    sortKey: "duration",
    text: (row) => formatDuration(row.durationMs),
  },
];

/** The text a plain column shows, `MISSING` when the value is unknown. */
export function columnText(column: TrackColumn, row: TrackTableRow): string {
  return column.kind === "text" ? (column.text(row) ?? MISSING) : "";
}

/** The artist the library groups the track under: album artist, else artist. */
export function albumArtistOf(row: Pick<TrackTableRow, "albumArtist" | "artist">): string {
  return row.albumArtist?.trim() || row.artist?.trim() || "";
}

/** Whether the track can be played or queued now. */
export function isTrackAvailable(row: Pick<TrackTableRow, "playable" | "availability">): boolean {
  return row.playable && row.availability === "available";
}

export type TrackRowAction = {
  label: string;
  kind: "play" | "pause" | "resume";
  /** Stays visible (not only on hover) because the track is the active one. */
  persistent: boolean;
};

/** What the action slot of a row does: Pause/Resume while it is the active track, else Play. */
export function trackRowAction(
  row: Pick<TrackTableRow, "id" | "title">,
  activeTrackId: string | null,
  status: TrackPlaybackStatus,
): TrackRowAction {
  if (row.id === activeTrackId && status === "playing") {
    return { label: `Pause ${row.title}`, kind: "pause", persistent: true };
  }
  if (row.id === activeTrackId && status === "paused") {
    return { label: `Resume ${row.title}`, kind: "resume", persistent: true };
  }
  return { label: `Play ${row.title}`, kind: "play", persistent: false };
}

/** What clicking the row itself does; nothing while the track is unavailable or already playing. */
export function rowClickIntent(
  row: Pick<TrackTableRow, "id" | "playable" | "availability">,
  activeTrackId: string | null,
  status: TrackPlaybackStatus,
): "play" | "resume" | null {
  if (!isTrackAvailable(row)) return null;
  if (row.id === activeTrackId && status === "playing") return null;
  if (row.id === activeTrackId && status === "paused") return "resume";
  return "play";
}

/** `n of total`, `n` alone when the total is unknown, `null` when there is no number. */
export function ofTotal(number: number | null, total: number | null): string | null {
  if (number === null) return null;
  return total === null ? String(number) : `${number} of ${total}`;
}
