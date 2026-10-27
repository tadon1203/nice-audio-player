/** How far the soft edge of a wipe reaches behind its front, in percent of the width. */
const EDGE_PERCENT = 20;

/** The mask of a wipe: the front's travel, and the mask of a wipe revealed some share of the way. */
export class WipeMask {
  /** The wipe front travels this far so the soft edge clears the end of the text. */
  public static readonly REVEAL_END_PERCENT = 100 + EDGE_PERCENT;

  /** The mask of a wipe revealed `percent` of the way: opaque behind the front, soft at its edge. */
  public static at(percent: number): string {
    return `linear-gradient(to right, black calc(${percent}% - ${EDGE_PERCENT}%), transparent ${percent}%)`;
  }
}
