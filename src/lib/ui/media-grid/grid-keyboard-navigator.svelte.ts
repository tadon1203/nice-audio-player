import { GridLayout, type GridMetrics } from "./media-grid-model";

export interface GridKeyboardNavigatorOptions {
  /** The list of tiles (`null` while it is still mounting). */
  list: () => HTMLElement | null;
  /** The region the grid scrolls in (`null` while it is still mounting). */
  scrollElement: () => HTMLElement | null;
  columns: () => number;
  count: () => number;
  /** The rows really in view, for PageUp and PageDown. */
  range: () => { startIndex: number; endIndex: number } | null;
  scrollMargin: () => number;
  metrics: GridMetrics;
  /** Read on each change of the mounted tiles, so a tile that mounts can take a wanted focus. */
  watch: () => unknown;
}

/**
 * Arrow keys move focus between tiles. A tile that is not mounted yet is scrolled to and focused
 * once it is. Construct it while a component initialises.
 */
export class GridKeyboardNavigator {
  #focusedIndex: number | null = null;
  #wanted: number | null = null;
  readonly #options: GridKeyboardNavigatorOptions;

  public constructor(options: GridKeyboardNavigatorOptions) {
    this.#options = options;
    $effect(() => {
      options.watch();
      this.#focusWanted();
    });
  }

  /** A tile took the focus: the arrows now move from it. */
  public focused(index: number): void {
    this.#focusedIndex = index;
  }

  public readonly onKeydown = (event: KeyboardEvent): void => {
    const focusedIndex = this.#focusedIndex;
    if (focusedIndex === null || event.ctrlKey || event.altKey || event.metaKey) return;
    const range = this.#options.range();
    const next = GridLayout.keyTarget(event.key, {
      from: focusedIndex,
      columns: this.#options.columns(),
      count: this.#options.count(),
      pageRows: Math.max(1, (range?.endIndex ?? 0) - (range?.startIndex ?? 0)),
    });
    if (next === null) return;
    // Focus is in the collection, so the arrows are the collection's (not the seek keys').
    event.preventDefault();
    this.#wanted = next;
    const scroller = this.#options.scrollElement();
    if (scroller !== null) {
      const offset = GridLayout.scrollOffsetToReveal({
        top: GridLayout.rowTop(
          next,
          this.#options.columns(),
          this.#options.scrollMargin(),
          this.#options.metrics,
        ),
        height: this.#options.metrics.tileHeight,
        scrollTop: scroller.scrollTop,
        viewHeight: scroller.clientHeight,
      });
      if (offset !== null) scroller.scrollTop = offset;
    }
    this.#focusWanted();
  };

  #focusWanted(): void {
    if (this.#wanted === null) return;
    const element = this.#options
      .list()
      ?.querySelector<HTMLElement>(`li[data-index="${this.#wanted}"]`);
    if (!element) return;
    this.#wanted = null;
    // The scroll is already ours; the browser must not add its own.
    element.querySelector<HTMLElement>("a[href], button")?.focus({ preventScroll: true });
  }
}
