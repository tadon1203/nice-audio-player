import type { Attachment } from "svelte/attachments";
import { Waveform } from "./waveform-model";

export interface PointerSeekOptions {
  durationMs: number;
  seekable: boolean;
  valueMs: number;
  onInput: (positionMs: number) => void;
  onCommit: (positionMs: number) => void;
  onCancel?: () => void;
  onHoverPositionChange?: (positionMs: number | null) => void;
}

/**
 * Pointer and keyboard interaction for the seek bar: press to jump, drag to scrub, hover to
 * preview a time. Dragging moves the position by the pointer's horizontal travel; the further
 * the pointer is from the bar vertically (or with Shift held) the slower it moves, so long
 * tracks can be set finely (`Waveform.scrubGain`). `onInput` follows the drag; `onCommit` fires
 * once on release. Put `attach` on the bar element; `options` is read live.
 */
export class PointerSeek {
  #element: HTMLElement | null = null;
  #hoverX = $state.raw<number | null>(null);
  #dragging = $state.raw(false);
  #scrubMs = $state.raw<number | null>(null);
  // The scrubbed position and where the pointer was when it was last folded into it.
  #scrub = { positionMs: 0, lastX: 0 };
  readonly #options: () => PointerSeekOptions;

  public constructor(options: () => PointerSeekOptions) {
    this.#options = options;
  }

  // Measured live: a cached width can lag the element's actual box while a layout settles.
  readonly #liveWidth = (): number => this.#element?.getBoundingClientRect().width ?? 0;
  readonly #offsetOf = (event: PointerEvent): number =>
    event.clientX - (this.#element?.getBoundingClientRect().left ?? 0);

  /** Folds the pointer's travel since the last event into the scrubbed position. */
  readonly #scrubTo = (event: PointerEvent): number => {
    const rect = this.#element?.getBoundingClientRect();
    const distance = rect ? Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0) : 0;
    const gain = Waveform.scrubGain(distance, event.shiftKey);
    this.#scrub = {
      positionMs: Waveform.scrubPosition(
        this.#scrub.positionMs,
        event.clientX - this.#scrub.lastX,
        gain,
        this.#liveWidth(),
        this.#options().durationMs,
      ),
      lastX: event.clientX,
    };
    this.#scrubMs = this.#scrub.positionMs;
    return this.#scrub.positionMs;
  };

  readonly #onPointerDown = (event: PointerEvent): void => {
    const { seekable, durationMs, onInput } = this.#options();
    if (!seekable || event.button !== 0 || this.#element === null) return;
    this.#element.setPointerCapture(event.pointerId);
    this.#dragging = true;
    // Pressing jumps to the pointer; only the drag after it is scaled.
    const positionMs = Waveform.positionFromOffset(
      this.#offsetOf(event),
      this.#liveWidth(),
      durationMs,
    );
    this.#scrub = { positionMs, lastX: event.clientX };
    this.#scrubMs = positionMs;
    onInput(positionMs);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const { durationMs, onInput, onHoverPositionChange } = this.#options();
    const width = this.#liveWidth();
    const nextHoverX = Math.min(width, Math.max(0, this.#offsetOf(event)));
    if (this.#dragging) {
      onInput(this.#scrubTo(event));
      return;
    }
    this.#hoverX = nextHoverX;
    onHoverPositionChange?.(Waveform.positionFromOffset(nextHoverX, width, durationMs));
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (!this.#dragging) return;
    const positionMs = this.#scrubTo(event);
    this.#dragging = false;
    this.#scrubMs = null;
    this.#options().onCommit(positionMs);
  };

  readonly #onPointerCancel = (): void => {
    this.#dragging = false;
    this.#scrubMs = null;
    this.#options().onCancel?.();
  };

  readonly #onPointerLeave = (): void => {
    this.#hoverX = null;
    this.#options().onHoverPositionChange?.(null);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const { seekable, valueMs, durationMs, onInput, onCommit } = this.#options();
    if (!seekable) return;
    const next = Waveform.nextSeekPosition(event.key, valueMs, durationMs);
    if (next === null) return;
    event.preventDefault();
    onInput(next);
    onCommit(next);
  };

  public readonly attach: Attachment<HTMLElement> = (node) => {
    this.#element = node;
    node.addEventListener("pointerdown", this.#onPointerDown);
    node.addEventListener("pointermove", this.#onPointerMove);
    node.addEventListener("pointerup", this.#onPointerUp);
    node.addEventListener("pointercancel", this.#onPointerCancel);
    node.addEventListener("pointerleave", this.#onPointerLeave);
    node.addEventListener("keydown", this.#onKeyDown);
    return () => {
      node.removeEventListener("pointerdown", this.#onPointerDown);
      node.removeEventListener("pointermove", this.#onPointerMove);
      node.removeEventListener("pointerup", this.#onPointerUp);
      node.removeEventListener("pointercancel", this.#onPointerCancel);
      node.removeEventListener("pointerleave", this.#onPointerLeave);
      node.removeEventListener("keydown", this.#onKeyDown);
      this.#element = null;
    };
  };

  public get dragging(): boolean {
    return this.#dragging;
  }

  /** While dragging, where the scrub really is, not where the pointer is. */
  public get hoverX(): number | null {
    const { durationMs } = this.#options();
    return this.#dragging && this.#scrubMs !== null && durationMs > 0
      ? (this.#scrubMs / durationMs) * this.#liveWidth()
      : this.#hoverX;
  }

  /** The time the pointer previews, or where a drag is; `null` when neither. */
  public get previewMs(): number | null {
    if (this.#dragging && this.#scrubMs !== null) return this.#scrubMs;
    return this.#hoverX === null
      ? null
      : Waveform.positionFromOffset(this.#hoverX, this.#liveWidth(), this.#options().durationMs);
  }
}
