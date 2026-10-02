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

/** Opacity by rows away from the current one (capped at 4), for lyrics and the queue alike. */
export const DISTANCE_OPACITY = [1, 0.9, 0.7, 0.5, 0.35] as const;

export function opacityAtDistance(distance: number): number {
  return DISTANCE_OPACITY[Math.min(Math.max(0, distance), DISTANCE_OPACITY.length - 1)]!;
}

/** The fade at the top and bottom edges of a scrolling column, and no scrollbar. */
export const EDGE_MASK =
  "mask-[linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)] [scrollbar-width:none] forced-colors:mask-none [&::-webkit-scrollbar]:hidden";
