import { untrack } from "svelte";
import type { TransitionConfig } from "svelte/transition";
import { motionFor } from "#lib/ui/motion/svelte-motion";
import type { SortMotionMode } from "./sort-motion.svelte";

export interface GridFlipOptions {
  /** Changes when the sort does. */
  signature: () => string;
  /** The list of tiles (`null` while it is still mounting). */
  list: () => HTMLElement | null;
  /** How the tiles move now: slide, fade, or nothing. */
  motion: () => SortMotionMode;
  /** Read on each change of the mounted tiles, so the slide plays once they have moved. */
  watch: () => unknown;
  /** Called when the sort changes, before the tiles move. */
  onSignatureChange: () => void;
}

/**
 * The slide is a FLIP done by hand, only around a sort: Svelte's `animate:` measures every tile
 * on every update, which slowed the scroll restore down enough to break it. `#before` is where
 * each tile was when the sort changed. The sorted items arrive later (from the catalog), so the
 * slide plays once tiles have actually moved, while the sort window is open. Construct it while
 * a component initialises.
 */
export class GridFlip {
  #before = new Map<string, DOMRect>();
  #watched: string;
  readonly #options: GridFlipOptions;

  public constructor(options: GridFlipOptions) {
    this.#options = options;
    this.#watched = untrack(options.signature);

    $effect.pre(() => {
      const signature = options.signature();
      if (signature === this.#watched) return;
      this.#watched = signature;
      // Still the old DOM: where each mounted tile is now.
      this.#before = new Map();
      options
        .list()
        ?.querySelectorAll<HTMLElement>("li[data-key]")
        .forEach((element) => {
          this.#before.set(element.dataset.key ?? "", element.getBoundingClientRect());
        });
      options.onSignatureChange();
    });

    $effect(() => {
      options.watch();
      this.#slide();
    });
  }

  /** The transition of a tile that mounts: a fade when the tiles fade, otherwise none. */
  public readonly fadeIn = (_node: Element): TransitionConfig => {
    if (this.#options.motion() !== "fade") return { duration: 0 };
    const { duration, easing } = motionFor("move");
    return { duration, easing, css: (t) => `opacity: ${t}` };
  };

  #slide(): void {
    if (this.#options.motion() !== "slide") {
      this.#before = new Map();
      return;
    }
    const list = this.#options.list();
    if (this.#before.size === 0 || list === null) return;
    const { duration, easing } = motionFor("move");
    const steps = 24;
    let moved = false;
    list.querySelectorAll<HTMLElement>("li[data-key]").forEach((element) => {
      const old = this.#before.get(element.dataset.key ?? "");
      if (old === undefined) return;
      const now = element.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (dx === 0 && dy === 0) return;
      moved = true;
      const keyframes = Array.from({ length: steps + 1 }, (_, i) => {
        const left = 1 - easing(i / steps);
        return { transform: `translate(${dx * left}px, ${dy * left}px)` };
      });
      element.animate(keyframes, { duration });
    });
    if (moved) this.#before = new Map();
  }
}
