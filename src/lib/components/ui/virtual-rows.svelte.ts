import type { Attachment } from "svelte/attachments";
import { ScrollView } from "#lib/components/ui/scroll-view.svelte";
import { createVirtualizer } from "@tanstack/svelte-virtual";
import { fromStore, get } from "svelte/store";
import type { VirtualItem } from "@tanstack/svelte-virtual";

interface VirtualRowsOptions {
  count: () => number;
  /** Fixed row height in px; rows are placed by arithmetic. */
  rowHeight: number;
  overscan: number;
}

/**
 * Virtualizes fixed-height rows inside the scroll view above the component: which rows to render, the spacer heights
 * above and below them. Construct it while a component initialises.
 */
export class VirtualRows {
  #scrollMargin = $state(0);
  #body = $state<HTMLElement | null>(null);
  // The virtualizer is configured on the first effect below, before anything reads its rows.
  readonly #virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => null,
    estimateSize: () => 0,
    overscan: 0,
  });
  readonly #state = fromStore(this.#virtualizer);

  readonly #items = $derived(this.#state.current.getVirtualItems());
  readonly #firstItem = $derived(this.#items[0]);
  readonly #lastItem = $derived(this.#items.at(-1));
  readonly #topSpacer = $derived(this.#firstItem ? this.#firstItem.start - this.#scrollMargin : 0);
  readonly #bottomSpacer = $derived(
    this.#lastItem
      ? this.#state.current.getTotalSize() - (this.#lastItem.end - this.#scrollMargin)
      : 0,
  );
  // The first row really in view (not the overscan rows above it).
  readonly #topIndex = $derived.by(() => {
    void this.#items;
    return this.#state.current.range?.startIndex ?? 0;
  });
  readonly #range = $derived.by(() => {
    void this.#items;
    return this.#state.current.range ?? null;
  });

  public constructor(options: VirtualRowsOptions) {
    const { rowHeight, overscan } = options;
    const scrollView = ScrollView.current();

    // Where the first row sits inside the scroll view (below the header), re-measured when the
    // scroll view's content resizes.
    $effect(() => {
      const element = scrollView.content;
      const scroller = scrollView.viewport;
      const first = this.#body;
      if (element === null || first === null) return;
      const measure = (): void => {
        if (scroller !== null) {
          this.#scrollMargin =
            first.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop;
        }
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return (): void => observer.disconnect();
    });

    // The scroll view exists only after it is bound, and the count and scroll margin change, so
    // the virtualizer is told again each time. Read through `get` so this effect does not depend on
    // the store it updates.
    $effect(() => {
      const element = scrollView.viewport;
      const instance = get(this.#virtualizer);
      instance.setOptions({
        count: options.count(),
        getScrollElement: () => element,
        estimateSize: () => rowHeight,
        overscan,
        scrollMargin: this.#scrollMargin,
      });
      instance._willUpdate();
      instance.measure();
    });
  }

  /** The element holding the rows; its top is where the first row sits. */
  public readonly attachBody: Attachment<HTMLElement> = (node) => {
    this.#body = node;
    return (): void => {
      this.#body = null;
    };
  };

  public get items(): VirtualItem[] {
    return this.#items;
  }

  public get topSpacer(): number {
    return this.#topSpacer;
  }

  public get bottomSpacer(): number {
    return this.#bottomSpacer;
  }

  public get topIndex(): number {
    return this.#topIndex;
  }

  public get scrollMargin(): number {
    return this.#scrollMargin;
  }

  /** The rows really in view (not the overscan), `null` before the first layout. */
  public get range(): { startIndex: number; endIndex: number } | null {
    return this.#range;
  }
}
