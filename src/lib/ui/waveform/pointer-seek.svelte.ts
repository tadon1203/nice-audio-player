import type { Attachment } from "svelte/attachments";
import { nextSeekPosition, positionFromOffset, scrubGain, scrubPosition } from "./waveform-model";

type PointerSeekOptions = {
  durationMs: number;
  seekable: boolean;
  valueMs: number;
  onInput: (positionMs: number) => void;
  onCommit: (positionMs: number) => void;
  onHoverPositionChange?: (positionMs: number | null) => void;
};

/**
 * Pointer and keyboard interaction for the seek bar: press to jump, drag to scrub, hover to
 * preview a time. Dragging moves the position by the pointer's horizontal travel; the further
 * the pointer is from the bar vertically (or with Shift held) the slower it moves, so long
 * tracks can be set finely (`scrubGain`). `onInput` follows the drag; `onCommit` fires once on
 * release. Put `attach` on the bar element; `options` is read live.
 */
export function createPointerSeek(options: () => PointerSeekOptions) {
  let element: HTMLElement | null = null;
  let hoverX = $state.raw<number | null>(null);
  let dragging = $state.raw(false);
  let scrubMs = $state.raw<number | null>(null);
  // The scrubbed position and where the pointer was when it was last folded into it.
  let scrub = { positionMs: 0, lastX: 0 };

  // Measured live: a cached width can lag the element's actual box while a layout settles.
  const liveWidth = () => element?.getBoundingClientRect().width ?? 0;
  const offsetOf = (event: PointerEvent) =>
    event.clientX - (element?.getBoundingClientRect().left ?? 0);

  /** Folds the pointer's travel since the last event into the scrubbed position. */
  function scrubTo(event: PointerEvent): number {
    const rect = element?.getBoundingClientRect();
    const distance = rect ? Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0) : 0;
    const gain = scrubGain(distance, event.shiftKey);
    scrub = {
      positionMs: scrubPosition(
        scrub.positionMs,
        event.clientX - scrub.lastX,
        gain,
        liveWidth(),
        options().durationMs,
      ),
      lastX: event.clientX,
    };
    scrubMs = scrub.positionMs;
    return scrub.positionMs;
  }

  function onPointerDown(event: PointerEvent) {
    const { seekable, durationMs, onInput } = options();
    if (!seekable || event.button !== 0 || element === null) return;
    element.setPointerCapture(event.pointerId);
    dragging = true;
    // Pressing jumps to the pointer; only the drag after it is scaled.
    const positionMs = positionFromOffset(offsetOf(event), liveWidth(), durationMs);
    scrub = { positionMs, lastX: event.clientX };
    scrubMs = positionMs;
    onInput(positionMs);
  }

  function onPointerMove(event: PointerEvent) {
    const { durationMs, onInput, onHoverPositionChange } = options();
    const width = liveWidth();
    const nextHoverX = Math.min(width, Math.max(0, offsetOf(event)));
    if (dragging) {
      onInput(scrubTo(event));
      return;
    }
    hoverX = nextHoverX;
    onHoverPositionChange?.(positionFromOffset(nextHoverX, width, durationMs));
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    const positionMs = scrubTo(event);
    dragging = false;
    scrubMs = null;
    options().onCommit(positionMs);
  }

  function onPointerCancel() {
    dragging = false;
    scrubMs = null;
  }

  function onPointerLeave() {
    hoverX = null;
    options().onHoverPositionChange?.(null);
  }

  function onKeyDown(event: KeyboardEvent) {
    const { seekable, valueMs, durationMs, onInput, onCommit } = options();
    if (!seekable) return;
    const next = nextSeekPosition(event.key, valueMs, durationMs);
    if (next === null) return;
    event.preventDefault();
    onInput(next);
    onCommit(next);
  }

  const attach: Attachment<HTMLElement> = (node) => {
    element = node;
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerCancel);
    node.addEventListener("pointerleave", onPointerLeave);
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("keydown", onKeyDown);
      element = null;
    };
  };

  return {
    attach,
    get dragging() {
      return dragging;
    },
    /** While dragging, where the scrub really is, not where the pointer is. */
    get hoverX(): number | null {
      const { durationMs } = options();
      return dragging && scrubMs !== null && durationMs > 0
        ? (scrubMs / durationMs) * liveWidth()
        : hoverX;
    },
    get hoverMs(): number | null {
      if (dragging && scrubMs !== null) return scrubMs;
      return hoverX === null ? null : positionFromOffset(hoverX, liveWidth(), options().durationMs);
    },
  };
}
