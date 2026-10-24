import { type AlbumTrackRow, type TrackSortKey, type TrackRow } from "#lib/native/bindings";
import { AudioFormatText } from "#lib/utils/audio-format-text";
import { cn } from "#lib/utils/cn.js";
import { DurationFormat } from "#lib/utils/duration-format";
import { MISSING } from "#lib/utils/missing";

/** A track row shared by the Library and Album layouts; both DTOs satisfy it directly. */
export type TrackTableRow = Pick<TrackRow, "id" | "title" | "artist" | "durationMs" | "state"> &
  Partial<
    Pick<TrackRow, "album"> &
      Pick<AlbumTrackRow, "trackNumber" | "discNumber" | "fileFormat" | "bitDepth" | "sampleRate">
  >;

/** The Library lists tracks across albums; the Album layout is one album's tracks in order. */
export type TrackTableLayout = "library" | "album";

export type TrackTableBreakpoint = "compact" | "narrow";

/**
 * One column: what it shows, how wide it is, below which container width it hides, and the
 * backend sort key a header click requests. The table never sorts or filters itself.
 */
interface ColumnBase {
  id: string;
  /** Header text; `null` leaves the header empty (the action slot). */
  header: string | null;
  /** Tailwind width class for the `<col>`; empty lets the column take the remaining width. */
  width: string;
  hideBelow?: TrackTableBreakpoint;
  sortKey?: TrackSortKey;
}

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
  text: (row) => DurationFormat.of(row.durationMs),
};

/** The columns, the row height and the rules that the track table reads. */
export class TrackColumns {
  /** Row height; rows are set to this explicitly so virtualization can place them by arithmetic. */
  public static readonly rowHeight = 40;

  /**
   * The container widths below which track table columns yield to the title. Header, cells and
   * `<col>` all read from here, so changing one breakpoint changes them together. The class names
   * are written out in full so Tailwind can see them.
   */
  public static readonly breakpoints = {
    compact: {
      hide: "@max-[600px]/track-table:hidden",
      /** For what takes the hidden column's place: the title cell's artist line. */
      show: "@max-[600px]/track-table:block",
    },
    narrow: { hide: "@max-[760px]/track-table:hidden" },
  } as const;

  /** The Library columns. */
  public static readonly library: readonly TrackColumn[] = [
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
      text: (row) => row.album?.title,
    },
    timeColumn,
  ];

  /** Sort keys apply to the Library layout only: an album's tracks are always in disc order. */
  public static readonly album: readonly TrackColumn[] = [
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
      text: (row) => TrackColumns.quality(row),
    },
    { ...timeColumn, sortKey: undefined },
  ];

  /** The columns of a layout. */
  public static of(layout: TrackTableLayout): readonly TrackColumn[] {
    return layout === "library" ? TrackColumns.library : TrackColumns.album;
  }

  /** The classes of a column's `<col>` (with its width) or of its header and cells (without). */
  public static classFor(column: TrackColumn, withWidth = false): string {
    return cn(
      withWidth && column.width,
      column.hideBelow && TrackColumns.breakpoints[column.hideBelow].hide,
    );
  }

  /**
   * Bit depth and sample rate in the signal path's notation (`24/96`) without the codec, which has
   * its own column; `44.1 kHz` when the depth is unknown, `null` when the rate is.
   */
  public static quality(row: Pick<TrackTableRow, "bitDepth" | "sampleRate">): string | null {
    if (!row.sampleRate) return null;
    return row.bitDepth
      ? `${row.bitDepth}/${AudioFormatText.kilohertz(row.sampleRate)}`
      : `${AudioFormatText.kilohertz(row.sampleRate)} kHz`;
  }

  /** The text a plain column shows, `MISSING` when the value is unknown. */
  public static columnText(column: TextColumn, row: TrackTableRow): string {
    return column.text(row) ?? MISSING;
  }
}
