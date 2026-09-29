import { useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { nextSeekPosition, positionFromOffset } from "./waveform-model";

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
 * Pointer and keyboard interaction for the seek bar: press/drag to seek, hover to preview a
 * time. `onInput` follows the pointer while dragging; `onCommit` fires once on release.
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

  // Measured live, not from the caller's `width` state: that only drives bar resampling and can
  // lag a frame behind the element's actual box (e.g. while a layout animation is still
  // settling), which would throw pointer math off by that same lag.
  const liveWidth = () => ref.current?.getBoundingClientRect().width ?? width;
  const offsetOf = (event: PointerEvent<HTMLDivElement>) =>
    event.clientX - (ref.current?.getBoundingClientRect().left ?? 0);
  const positionOf = (event: PointerEvent<HTMLDivElement>) =>
    positionFromOffset(offsetOf(event), liveWidth(), durationMs);

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (!seekable || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      onInput(positionOf(event));
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const currentWidth = liveWidth();
      const nextHoverX = Math.min(currentWidth, Math.max(0, offsetOf(event)));
      setHoverX(nextHoverX);
      onHoverPositionChange?.(positionFromOffset(nextHoverX, currentWidth, durationMs));
      if (dragging) onInput(positionOf(event));
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setDragging(false);
      onCommit(positionOf(event));
    },
    onPointerCancel: () => setDragging(false),
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

  const hoverMs = hoverX === null ? null : positionFromOffset(hoverX, liveWidth(), durationMs);
  return { dragging, hoverX, hoverMs, handlers };
}
