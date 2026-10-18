import type { TrackTableRow } from "./track-columns";

/** The "Disc n" rows that split an album on several discs. */
export class TrackDiscs {
  /** Whether the tracks are on more than one disc, which splits them by "Disc n" rows. */
  public static hasSeveral(rows: readonly Pick<TrackTableRow, "discNumber">[]): boolean {
    return rows.some((row) => (row.discNumber ?? 1) > 1);
  }

  /** Whether `rows[index]` opens a disc (only meaningful when `hasSeveral`). */
  public static starts(rows: readonly Pick<TrackTableRow, "discNumber">[], index: number): boolean {
    const disc = rows[index]?.discNumber;
    return disc != null && disc !== rows[index - 1]?.discNumber;
  }
}
