import type { Attachment } from "svelte/attachments";
import { SpringCurve } from "#lib/components/ui/motion/spring-curve";
import { TokenTiming } from "#lib/components/ui/motion/token-timing";
import { NumberTween } from "#lib/components/ui/motion/number-tween";
import { levelToUnit } from "#lib/utils/level";

/** Height of the flat line the bars grow out of, in px. */
export const BASELINE_PX = 2;
/** Total time for the growth to sweep from the first bar to the last. */
const SWEEP_MS = TokenTiming.delayOf("move", 1.45);
/** How long one bar takes to grow. */
const MOVE_MS = TokenTiming.duration("move", false);

/** What the painter draws. */
export interface WaveformPaint {
  /** Resampled RMS levels, 0-255. Empty while the backend analyzes the file. */
  readonly bars: readonly number[];
  readonly height: number;
  /** Grow left to right instead of all at once. */
  readonly sweep: boolean;
  /** The bars appear without growing: the caller's motion budget does not allow it. */
  readonly still: boolean;
}

/**
 * The bars on one canvas, in the canvas's computed `color`, with the same per-bar growth the
 * spring curve gave them as transitions. A canvas is used because a few hundred rects per layer
 * would make the page heavy. Put `attach` on the canvas and pass each new view to `update`.
 */
export class WaveformPainter {
  #canvas: HTMLCanvasElement | null = null;
  #paint: WaveformPaint | null = null;
  // Elapsed growth time in ms; infinity is fully grown.
  #elapsed = 0;
  #grown = false;

  /** Repaints when the size or the colour changes; the canvas is painted as soon as it mounts. */
  public readonly attach: Attachment<HTMLCanvasElement> = (node) => {
    this.#canvas = node;
    const resize = new ResizeObserver(() => this.#draw());
    resize.observe(node);
    // The colour comes from a class on the layer, or the theme and the accent on the root. The
    // root also carries `--artwork-accent` as inline style, set once the artwork is analyzed.
    const recolour = new MutationObserver(() => this.#draw());
    const filter = { attributes: true, attributeFilter: ["class"] };
    if (node.parentElement) recolour.observe(node.parentElement, filter);
    recolour.observe(document.documentElement, { ...filter, attributeFilter: ["class", "style"] });
    this.#grow();
    this.#draw();
    return (): void => {
      resize.disconnect();
      recolour.disconnect();
      this.#canvas = null;
    };
  };

  /**
   * Takes a new view. New or refined bars, or a new height, repaint in place at the current
   * growth. The bars grow out of the baseline once, when they first have a canvas to appear on;
   * the caller keys the painter by track, so a new track starts flat. `sweep` and `still` are
   * read when the growth starts.
   */
  public update(paint: WaveformPaint): void {
    this.#paint = paint;
    this.#grow();
    this.#draw();
  }

  /** Starts the growth, once, as soon as both a canvas and a view are there. */
  #grow(): void {
    const paint = this.#paint;
    if (this.#grown || this.#canvas === null || paint === null) return;
    this.#grown = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (paint.still || reduced) {
      this.#elapsed = Number.POSITIVE_INFINITY;
      return;
    }
    const total = MOVE_MS + (paint.sweep ? SWEEP_MS : 0);
    new NumberTween(0, total, {
      duration: total,
      easing: (t: number): number => t,
      onUpdate: (value): void => {
        this.#elapsed = value;
        this.#draw();
      },
      onComplete: (): void => {
        this.#elapsed = Number.POSITIVE_INFINITY;
      },
    });
  }

  /** Paints every bar for the current `elapsed`: one fillRect each, nothing allocated. */
  #draw(): void {
    const node = this.#canvas;
    const ctx = node?.getContext("2d");
    const paint = this.#paint;
    if (!node || !ctx || paint === null) return;
    const { bars, height, sweep } = paint;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = node.clientWidth;
    const pxWidth = Math.round(cssWidth * dpr);
    const pxHeight = Math.round(height * dpr);
    // Assigning a size clears the canvas, so only do it when it changed.
    if (node.width !== pxWidth) node.width = pxWidth;
    if (node.height !== pxHeight) node.height = pxHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    ctx.fillStyle = getComputedStyle(node).color;
    const count = bars.length;
    const unit = cssWidth / count;
    for (let index = 0; index < count; index += 1) {
      const full = Math.max(BASELINE_PX, levelToUnit(bars[index]!) * (height - 2));
      const delay = sweep ? (index / count) * SWEEP_MS : 0;
      const progress = SpringCurve.easing(
        Math.min(1, Math.max(0, (this.#elapsed - delay) / MOVE_MS)),
      );
      const barHeight = BASELINE_PX + (full - BASELINE_PX) * progress;
      ctx.fillRect((index + 0.15) * unit, height - barHeight, 0.7 * unit, barHeight);
    }
  }
}
