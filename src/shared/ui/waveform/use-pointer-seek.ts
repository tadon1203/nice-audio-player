import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { nextSeekPosition, positionFromOffset, scrubGain, scrubPosition } from "./waveform-model";

type PointerSeekOptions = {
  ref: RefObject<HTMLDivElement | null>;
  durationMs: number;
  /** Fallback width when the element is not measurable yet. */
  width: number;
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
 * release.
 */
export function usePointerSeek({
  ref,
  durationMs,
  width,
  seekable,
  valueMs,
  onInput,
  onCommit,
  onHoverPositionChange,
}: PointerSeekOptions) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // The scrubbed position and where the pointer was when it was last folded into it.
  const scrub = useRef({ positionMs: 0, lastX: 0 });
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  // Measured live, not from the caller's `width` state: that only drives bar resampling and can
  // lag a frame behind the element's actual box (e.g. while a layout animation is still
  // settling), which would throw pointer math off by that same lag.
  const liveWidth = () => ref.current?.getBoundingClientRect().width ?? width;
  const offsetOf = (event: PointerEvent<HTMLDivElement>) =>
    event.clientX - (ref.current?.getBoundingClientRect().left ?? 0);

  /** Folds the pointer's travel since the last event into the scrubbed position. */
  const scrubTo = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    const distance = rect ? Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0) : 0;
    const gain = scrubGain(distance, event.shiftKey);
    scrub.current = {
      positionMs: scrubPosition(
        scrub.current.positionMs,
        event.clientX - scrub.current.lastX,
        gain,
        liveWidth(),
        durationMs,
      ),
      lastX: event.clientX,
    };
    setScrubMs(scrub.current.positionMs);
    return scrub.current.positionMs;
  };

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (!seekable || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      // Pressing jumps to the pointer; only the drag after it is scaled.
      const positionMs = positionFromOffset(offsetOf(event), liveWidth(), durationMs);
      scrub.current = { positionMs, lastX: event.clientX };
      setScrubMs(positionMs);
      onInput(positionMs);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const currentWidth = liveWidth();
      const nextHoverX = Math.min(currentWidth, Math.max(0, offsetOf(event)));
      if (dragging) {
        onInput(scrubTo(event));
        return;
      }
      setHoverX(nextHoverX);
      onHoverPositionChange?.(positionFromOffset(nextHoverX, currentWidth, durationMs));
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const positionMs = scrubTo(event);
      setDragging(false);
      setScrubMs(null);
      onCommit(positionMs);
    },
    onPointerCancel: () => {
      setDragging(false);
      setScrubMs(null);
    },
    onPointerLeave: () => {
      setHoverX(null);
      onHoverPositionChange?.(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (!seekable) return;
      const next = nextSeekPosition(event.key, valueMs, durationMs);
      if (next === null) return;
      event.preventDefault();
      onInput(next);
      onCommit(next);
    },
  };

  // While dragging, the marker shows where the scrub really is, not where the pointer is.
  const shownX =
    dragging && scrubMs !== null && durationMs > 0 ? (scrubMs / durationMs) * liveWidth() : hoverX;
  const hoverMs =
    dragging && scrubMs !== null
      ? scrubMs
      : hoverX === null
        ? null
        : positionFromOffset(hoverX, liveWidth(), durationMs);
  return { dragging, hoverX: shownX, hoverMs, handlers };
}
