import type {
  LibraryAlbumTrackSummary,
  LibraryTrackSortKey,
  LibraryTrackSummary,
} from "$lib/native";
import { isTrackAvailable } from "$lib/library/tracks";
import { formatDuration, formatKilohertz, MISSING } from "$lib/utils/format";

/** A track row shared by the Library and Album layouts; both DTOs satisfy it directly. */
export type TrackTableRow = Pick<
  LibraryTrackSummary,
  "id" | "title" | "artist" | "durationMs" | "availability" | "playable"
> &
  Partial<
    Pick<LibraryTrackSummary, "album" | "albumArtist" | "albumKey"> &
      Pick<
        LibraryAlbumTrackSummary,
        "trackNumber" | "discNumber" | "fileFormat" | "bitDepth" | "sampleRate"
      >
  >;

/** The Library lists tracks across albums; the Album layout is one album's tracks in order. */
export type TrackTableLayout = "library" | "album";

export type TrackPlaybackStatus = "stopped" | "playing" | "paused" | "failed";

/**
 * The container widths below which track table columns yield to the title. Header, cells and
 * `<col>` all read from here, so changing one breakpoint changes them together. The class names
 * are written out in full so Tailwind can see them.
 */
export const trackTableBreakpoints = {
  compact: {
    hide: "@max-[600px]/track-table:hidden",
    /** For what takes the hidden column's place: the title cell's artist line. */
    show: "@max-[600px]/track-table:block",
  },
  narrow: { hide: "@max-[760px]/track-table:hidden" },
} as const;

export type TrackTableBreakpoint = keyof typeof trackTableBreakpoints;

/** Row height; rows are set to this explicitly so virtualization can place them by arithmetic. */
export const TRACK_ROW_HEIGHT = 40;

/**
 * One column: what it shows, how wide it is, below which container width it hides, and the
 * backend sort key a header click requests. The table never sorts or filters itself.
 */
type ColumnBase = {
  id: string;
  /** Header text; `null` leaves the header empty (the action slot). */
  header: string | null;
  /** Tailwind width class for the `<col>`; empty lets the column take the remaining width. */
  width: string;
  hideBelow?: TrackTableBreakpoint;
  sortKey?: LibraryTrackSortKey;
};

/** A column that shows a plain value; `text` returns `null` when the value is unknown. */
export type TextColumn = ColumnBase & {
  kind: "text";
  text: (row: TrackTableRow) => string | null | undefined;
};

export type TrackColumn = TextColumn | (ColumnBase & { kind: "action" | "title" });

const timeColumn: TrackColumn = {
  id: "durationMs",
  kind: "text",
  header: "Time",
  width: "w-20",
  sortKey: "duration",
  text: (row) => formatDuration(row.durationMs),
};

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
  timeColumn,
];

/** Sort keys apply to the Library layout only: an album's tracks are always in disc order. */
export const albumTrackColumns: readonly TrackColumn[] = [
  { id: "action", kind: "action", header: "#", width: "w-12" },
  { id: "title", kind: "title", header: "Title", width: "" },
  {
    id: "artist",
    kind: "text",
    header: "Artist",
    width: "w-36",
    hideBelow: "compact",
    text: (row) => row.artist,
  },
  {
    id: "fileFormat",
    kind: "text",
    header: "Format",
    width: "w-24",
    hideBelow: "narrow",
    text: (row) => row.fileFormat,
  },
  {
    id: "sampleRate",
    kind: "text",
    header: "Quality",
    width: "w-36",
    hideBelow: "narrow",
    text: trackQuality,
  },
  { ...timeColumn, sortKey: undefined },
];

/**
 * Bit depth and sample rate in the signal path's notation (`24/96`) without the codec, which has
 * its own column; `44.1 kHz` when the depth is unknown, `null` when the rate is.
 */
export function trackQuality(row: Pick<TrackTableRow, "bitDepth" | "sampleRate">): string | null {
  if (!row.sampleRate) return null;
  return row.bitDepth
    ? `${row.bitDepth}/${formatKilohertz(row.sampleRate)}`
    : `${formatKilohertz(row.sampleRate)} kHz`;
}

/** Whether the tracks are on more than one disc, which splits them by "Disc n" rows. */
export function hasSeveralDiscs(rows: readonly Pick<TrackTableRow, "discNumber">[]): boolean {
  return rows.some((row) => (row.discNumber ?? 1) > 1);
}

/** Whether `rows[index]` opens a disc (only meaningful when `hasSeveralDiscs`). */
export function startsDisc(
  rows: readonly Pick<TrackTableRow, "discNumber">[],
  index: number,
): boolean {
  const disc = rows[index]?.discNumber;
  return disc != null && disc !== rows[index - 1]?.discNumber;
}

/** The text a plain column shows, `MISSING` when the value is unknown. */
export function columnText(column: TextColumn, row: TrackTableRow): string {
  return column.text(row) ?? MISSING;
}

export type TrackRowAction = {
  label: string;
  kind: "play" | "pause" | "resume";
  /** Stays visible (not only on hover) because the track is the active one. */
  persistent: boolean;
};

export type TrackRowState = {
  action: TrackRowAction;
  /** What clicking the row itself does; nothing while unavailable or already playing. */
  clickIntent: "play" | "resume" | null;
  /** Set only for the active track while it is playing or paused. */
  playbackState: "playing" | "paused" | undefined;
};

/**
 * What a row offers, decided once from whether it is the active track and the playback status:
 * Pause/Resume for the active track, else Play.
 */
export function trackRowState(
  row: Pick<TrackTableRow, "id" | "title" | "playable" | "availability">,
  activeTrackId: string | null,
  status: TrackPlaybackStatus,
): TrackRowState {
  const playbackState =
    row.id === activeTrackId && (status === "playing" || status === "paused") ? status : undefined;
  const action: TrackRowAction =
    playbackState === "playing"
      ? { label: `Pause ${row.title}`, kind: "pause", persistent: true }
      : playbackState === "paused"
        ? { label: `Resume ${row.title}`, kind: "resume", persistent: true }
        : { label: `Play ${row.title}`, kind: "play", persistent: false };
  const clickIntent =
    !isTrackAvailable(row) || playbackState === "playing"
      ? null
      : playbackState === "paused"
        ? "resume"
        : "play";
  return { action, clickIntent, playbackState };
}
