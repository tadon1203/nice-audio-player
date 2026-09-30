/** Tile and gap sizes in px. Tiles are a fixed size, so where a row is is plain arithmetic. */
export type GridMetrics = {
  readonly tileWidth: number;
  readonly columnGap: number;
  readonly tileHeight: number;
  readonly rowGap: number;
};

/** How many tiles fit across `width`, as `auto-fill` would place them (at least one). */
export function columnCount(width: number, metrics: GridMetrics): number {
  return Math.max(
    1,
    Math.floor((width + metrics.columnGap) / (metrics.tileWidth + metrics.columnGap)),
  );
}

/** The top of the row holding `index`, in the scroll region's coordinates. */
export function rowTop(
  index: number,
  columns: number,
  scrollMargin: number,
  metrics: GridMetrics,
): number {
  return scrollMargin + Math.floor(index / columns) * (metrics.tileHeight + metrics.rowGap);
}

export type GridNavigation = {
  readonly from: number;
  readonly columns: number;
  readonly count: number;
  /** Rows in view, for PageUp and PageDown. */
  readonly pageRows: number;
};

/** The tile a navigation key moves focus to, or null for a key the grid does not handle. */
export function keyTarget(key: string, { from, columns, count, pageRows }: GridNavigation) {
  const target = {
    ArrowLeft: from - 1,
    ArrowRight: from + 1,
    ArrowUp: from - columns,
    ArrowDown: from + columns,
    PageUp: from - pageRows * columns,
    PageDown: from + pageRows * columns,
    Home: 0,
    End: count - 1,
  }[key];
  return target === undefined ? null : Math.min(count - 1, Math.max(0, target));
}

/** The scrollTop that brings a row into view, or null when it already is. */
export function scrollOffsetToReveal(row: {
  top: number;
  height: number;
  scrollTop: number;
  viewHeight: number;
}): number | null {
  if (row.top < row.scrollTop) return row.top;
  const bottom = row.top + row.height;
  if (bottom > row.scrollTop + row.viewHeight) return bottom - row.viewHeight;
  return null;
}
