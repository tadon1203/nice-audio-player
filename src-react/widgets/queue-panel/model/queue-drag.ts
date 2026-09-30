/**
 * Where a dragged row would be dropped, as an insertion slot: 0 is before the first row and
 * `midpoints.length` is after the last. `midpoints` are the rows' vertical centres in order.
 */
export function dropSlot(midpoints: readonly number[], pointerY: number): number {
  return midpoints.filter((midpoint) => midpoint < pointerY).length;
}

/**
 * The index the item ends up at when it moves from `from` into insertion `slot`. Removing it
 * first shifts every later slot down by one.
 */
export function slotToIndex(slot: number, from: number): number {
  return slot > from ? slot - 1 : slot;
}

/**
 * `dropSlot` for rows of one fixed height, without needing every row's midpoint: `offsetY` is
 * the pointer's distance below the top of the first row, and `count` the number of rows. Rows
 * that are not mounted (a virtualized list) still count.
 */
export function dropSlotForFixedRows(offsetY: number, rowHeight: number, count: number): number {
  if (rowHeight <= 0) return 0;
  return Math.min(count, Math.max(0, Math.ceil(offsetY / rowHeight - 0.5)));
}
