import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { dropSlot, slotToIndex } from "./queue-drag";

type Drag = { id: string; from: number; slot: number; rowHeight: number };

/**
 * Pointer-driven reordering for the upcoming list. Dragging only chooses an insertion slot
 * (shown as a line); the move itself is one `onMove` call on release, and the rows then
 * animate into place from the queue update. Buttons remain for keyboard use.
 */
export function useQueueDrag(onMove: (id: string, to: number) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const handlersFor = (id: string, from: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const rowHeight = listRef.current?.children[from]?.getBoundingClientRect().height ?? 0;
      setDrag({ id, from, slot: from, rowHeight });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag === null || drag.id !== id) return;
      const rows = Array.from(listRef.current?.children ?? []);
      // Rows at and after the slot are shifted down to make room. Measure them where they
      // rest (`offsetTop` ignores transforms), or the shift would move the slot under the pointer.
      const list = listRef.current;
      const listTop = list?.getBoundingClientRect().top ?? 0;
      const midpoints = rows.map((row) => {
        const rest = (row as HTMLElement).offsetTop - (list?.offsetTop ?? 0);
        return listTop + rest + (row as HTMLElement).offsetHeight / 2;
      });
      setDrag({ ...drag, slot: dropSlot(midpoints, event.clientY) });
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
