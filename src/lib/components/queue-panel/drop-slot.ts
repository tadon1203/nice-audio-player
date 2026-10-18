/**
 * Calculations for where a dragged row lands. A slot is an insertion point: 0 is before the first
 * row and `midpoints.length` is after the last.
 */
export class DropSlot {
  /**
   * The index the item ends up at when it moves from `from` into insertion `slot`. Removing it
   * first shifts every later slot down by one.
   */
  public static toIndex(slot: number, from: number): number {
    return slot > from ? slot - 1 : slot;
  }

  /**
   * Where a dragged row would be dropped, for rows of one fixed height: `offsetY` is the pointer's
   * distance below the top of the first row, and `count` the number of rows. Rows that are not
   * mounted (a virtualized list) still count, so no row's midpoint is needed.
   */
  public static ofFixedRows(offsetY: number, rowHeight: number, count: number): number {
    if (rowHeight <= 0) return 0;
    return Math.min(count, Math.max(0, Math.ceil(offsetY / rowHeight - 0.5)));
  }
}
