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
