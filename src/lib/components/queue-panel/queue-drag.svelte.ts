import type { Attachment } from "svelte/attachments";
import { type QueueItemId } from "#lib/native/bindings";
import type { HTMLAttributes } from "svelte/elements";
import { ScrollView } from "#lib/components/ui/scroll-view.svelte";
import { DropSlot } from "./drop-slot";

/** Within this distance of the scroll view's edge a drag scrolls it, this far per move. */
const EDGE_PX = 40;
const EDGE_STEP_PX = 16;

interface DragState {
  id: QueueItemId;
  from: number;
  slot: number;
}

interface QueueDragOptions {
  onMove: (id: QueueItemId, to: number) => void;
  rowHeight: number;
  /** How many rows the list has, mounted or not. */
  count: () => number;
}

/**
 * Pointer-driven reordering for the upcoming list. Dragging only chooses an insertion slot
 * (shown as a line); the move itself is one `onMove` call on release, and the rows then animate
 * into place from the queue update. Buttons remain for keyboard use. Rows have one height, so the
 * slot is arithmetic and works while most rows are not mounted; near the top or bottom of the
 * scroll view a drag scrolls it.
 */
export class QueueDrag {
  public drag = $state<DragState | null>(null);
  readonly #options: QueueDragOptions;
  readonly #scrollView = ScrollView.current();
  #list: HTMLElement | null = null;

  public constructor(options: QueueDragOptions) {
    this.#options = options;
  }

  /** The list whose top is where its first row would sit. */
  public readonly attachList: Attachment<HTMLElement> = (node) => {
    this.#list = node;
    return (): void => {
      this.#list = null;
    };
  };

  public get rowHeight(): number {
    return this.#options.rowHeight;
  }

  /** The pointer handlers for the drag handle of upcoming item `id` at index `from`. */
  public readonly handlersFor = (
    id: QueueItemId,
    from: number,
  ): Pick<
    HTMLAttributes<HTMLElement>,
    "onpointerdown" | "onpointermove" | "onpointerup" | "onpointercancel"
  > => {
    return {
      onpointerdown: (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        this.drag = { id, from, slot: from };
      },
      onpointermove: (event) => {
        const drag = this.drag;
        if (drag === null || drag.id !== id) return;
        const { rowHeight, count } = this.#options;
        const scroller = this.#scrollView.viewport;
        if (scroller !== null) {
          const box = scroller.getBoundingClientRect();
          if (event.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_STEP_PX;
          else if (event.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_STEP_PX;
        }
        // The list's box starts where its first row would, whichever rows are mounted (its
        // padding stands in for the ones that are not), and rows are measured where they rest, so
        // the shift that makes room does not move the slot under the pointer.
        const listTop = this.#list?.getBoundingClientRect().top ?? 0;
        this.drag = {
          ...drag,
          slot: DropSlot.ofFixedRows(event.clientY - listTop, rowHeight, count()),
        };
      },
      onpointerup: () => {
        const drag = this.drag;
        if (drag === null || drag.id !== id) return;
        const to = DropSlot.toIndex(drag.slot, drag.from);
        this.drag = null;
        if (to !== drag.from) this.#options.onMove(id, to);
      },
      onpointercancel: () => {
        this.drag = null;
      },
    };
  };
}
