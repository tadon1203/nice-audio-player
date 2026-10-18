import { untrack } from "svelte";

/** How tiles change places for a moment after a sort: they slide, or (from far down) fade in. */
export type SortMotionMode = "slide" | "fade" | null;

const HOLD_MS = 800;

/**
 * For a moment after `signature` (a sort key and direction) changes, says how a grid moves its
 * tiles: only for a sort, since typing in the filter changes the tiles too and must not animate.
 * A list that is scrolled down goes back to the top on a sort, so the tiles that were on screen
 * have nowhere to slide to: those fade in instead. `scrollElement` is where the grid scrolls.
 * Construct it while a component initialises.
 */
export class SortMotion {
  #motion = $state<SortMotionMode>(null);
  #seen: string;

  public constructor(signature: () => string, scrollElement: () => HTMLElement | null) {
    this.#seen = untrack(signature);

    // Before the DOM update, so the scroll position is still the one the sort was made from.
    $effect.pre(() => {
      const next = signature();
      if (next === this.#seen) return;
      this.#seen = next;
      const scroller = untrack(scrollElement);
      this.#motion = scroller !== null && scroller.scrollTop > 1 ? "fade" : "slide";
      const timer = setTimeout(() => (this.#motion = null), HOLD_MS);
      return (): void => clearTimeout(timer);
    });
  }

  public get current(): SortMotionMode {
    return this.#motion;
  }
}
