/** Where "now" sits in a scrolling column: this fraction of its height from the top. */
export const ANCHOR_FRACTION = 0.4;

/**
 * The spacers that let a column's first and last rows reach the anchor line: `top` (40% of the
 * height) before the rows and `bottom` (the other 60%) after them.
 */
export function anchorSpacers(height: number): { top: number; bottom: number } {
  return { top: height * ANCHOR_FRACTION, bottom: height * (1 - ANCHOR_FRACTION) };
}

/** The scroll offset that puts the centre of a row on the anchor line, kept inside the scroll range. */
export function anchorScrollTop({
  rowTop,
  rowHeight,
  clientHeight,
  scrollHeight,
}: {
  rowTop: number;
  rowHeight: number;
  clientHeight: number;
  scrollHeight: number;
}): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const target = rowTop + rowHeight / 2 - clientHeight * ANCHOR_FRACTION;
  return Math.max(0, Math.min(target, maxScroll));
}

/** Keep distant rows readable; time ink supplies their de-emphasis without an opacity mask. */
export const EDGE_MASK = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
