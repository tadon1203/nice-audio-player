/** How far the soft edge of a wipe reaches behind its front, in percent of the width. */
const EDGE_PERCENT = 20;
/** The wipe front travels this far so the soft edge clears the end of the text. */
export const REVEAL_END_PERCENT = 100 + EDGE_PERCENT;

/** The mask of a wipe revealed `percent` of the way: opaque behind the front, soft at its edge. */
export function wipeMask(percent: number): string {
  return `linear-gradient(to right, black calc(${percent}% - ${EDGE_PERCENT}%), transparent ${percent}%)`;
}
