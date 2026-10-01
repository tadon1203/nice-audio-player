import type { HTMLButtonAttributes } from "svelte/elements";
import { dropSlotForFixedRows, slotToIndex } from "./queue-drag";

/** Within this distance of the scroll region's edge a drag scrolls it, this far per move. */
const EDGE_PX = 40;
const EDGE_STEP_PX = 16;

type DragState = { id: string; from: number; slot: number };

type QueueDragOptions = {
  onMove: (id: string, to: number) => void;
  rowHeight: number;
  /** How many rows the list has, mounted or not. */
  count: () => number;
  scrollElement: () => HTMLElement | null;
  /** The list whose top is where its first row would sit. */
  list: () => HTMLElement | null;
};

/**
 * Pointer-driven reordering for the upcoming list. Dragging only chooses an insertion slot
 * (shown as a line); the move itself is one `onMove` call on release, and the rows then animate
 * into place from the queue update. Buttons remain for keyboard use. Rows have one height, so the
 * slot is arithmetic and works while most rows are not mounted; near the top or bottom of the
 * scroll region a drag scrolls it.
 */
export class QueueDrag {
  drag = $state<DragState | null>(null);
  readonly #options: QueueDragOptions;

  constructor(options: QueueDragOptions) {
    this.#options = options;
  }

  get rowHeight(): number {
    return this.#options.rowHeight;
  }

  /** The pointer handlers for the drag handle of upcoming item `id` at index `from`. */
  handlersFor(id: string, from: number): HTMLButtonAttributes {
    return {
      onpointerdown: (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        this.drag = { id, from, slot: from };
      },
      onpointermove: (event) => {
        const drag = this.drag;
        if (drag === null || drag.id !== id) return;
        const { scrollElement, list, rowHeight, count } = this.#options;
        const scroller = scrollElement();
        if (scroller !== null) {
          const box = scroller.getBoundingClientRect();
          if (event.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_STEP_PX;
          else if (event.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_STEP_PX;
        }
        // The list's box starts where its first row would, whichever rows are mounted (its
        // padding stands in for the ones that are not), and rows are measured where they rest, so
        // the shift that makes room does not move the slot under the pointer.
        const listTop = list()?.getBoundingClientRect().top ?? 0;
        this.drag = {
          ...drag,
          slot: dropSlotForFixedRows(event.clientY - listTop, rowHeight, count()),
        };
      },
      onpointerup: () => {
        const drag = this.drag;
        if (drag === null || drag.id !== id) return;
        const to = slotToIndex(drag.slot, drag.from);
        this.drag = null;
        if (to !== drag.from) this.#options.onMove(id, to);
      },
      onpointercancel: () => {
        this.drag = null;
      },
    };
  }
}
