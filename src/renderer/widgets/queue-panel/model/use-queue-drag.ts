import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { dropSlotForFixedRows, slotToIndex } from "./queue-drag";

/** Within this distance of the scroll region's edge a drag scrolls it, this far per move. */
const EDGE_PX = 40;
const EDGE_STEP_PX = 16;

type Drag = { id: string; from: number; slot: number; rowHeight: number };

/**
 * Pointer-driven reordering for the upcoming list. Dragging only chooses an insertion slot
 * (shown as a line); the move itself is one `onMove` call on release, and the rows then
 * animate into place from the queue update. Buttons remain for keyboard use. Rows have one
 * height (`rowHeight`, `count` of them), so the slot is arithmetic and works while most rows are
 * not mounted; near the top or bottom of `scrollElement` a drag scrolls it.
 */
export function useQueueDrag(
  onMove: (id: string, to: number) => void,
  rowHeight: number,
  count: number,
  scrollElement: HTMLElement | null,
) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const handlersFor = (id: string, from: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ id, from, slot: from, rowHeight });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag === null || drag.id !== id) return;
      // The list's box starts where its first row would, whichever rows are mounted (its
      // padding stands in for the ones that are not), and rows are measured where they rest, so
      // the shift that makes room does not move the slot under the pointer.
      if (scrollElement !== null) {
        const box = scrollElement.getBoundingClientRect();
        if (event.clientY < box.top + EDGE_PX) scrollElement.scrollTop -= EDGE_STEP_PX;
        else if (event.clientY > box.bottom - EDGE_PX) scrollElement.scrollTop += EDGE_STEP_PX;
      }
      const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
      setDrag({
        ...drag,
        slot: dropSlotForFixedRows(event.clientY - listTop, rowHeight, count),
      });
    },
    onPointerUp: () => {
      if (drag === null || drag.id !== id) return;
      const to = slotToIndex(drag.slot, drag.from);
      setDrag(null);
      if (to !== drag.from) onMove(id, to);
    },
    onPointerCancel: () => setDrag(null),
  });

  return { listRef, drag, handlersFor };
}
