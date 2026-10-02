import { createVirtualizer } from "@tanstack/svelte-virtual";
import { fromStore, get } from "svelte/store";

type VirtualRowsOptions = {
  count: () => number;
  /** The region the rows scroll in (`null` while it is still mounting). */
  scrollElement: () => HTMLElement | null;
  /** Fixed row height in px; rows are placed by arithmetic. */
  rowHeight: number;
  overscan: number;
  /** The element whose size changes re-measure the scroll margin. */
  container: () => HTMLElement | null;
  /** The element holding the rows; its top is where the first row sits. */
  body: () => HTMLElement | null;
};

/**
 * Virtualizes fixed-height rows inside a scroll region: which rows to render, the spacer heights
 * above and below them. Call during component init.
 */
export function createVirtualRows(options: VirtualRowsOptions) {
  const { rowHeight, overscan } = options;
  let scrollMargin = $state(0);

  // Where the first row sits inside the scroll region (below the header), re-measured when the
  // container resizes.
  $effect(() => {
    const element = options.container();
    const scroller = options.scrollElement();
    const first = options.body();
    if (element === null || first === null) return;
    const measure = () => {
      if (scroller !== null) {
        scrollMargin =
          first.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => null,
    estimateSize: () => rowHeight,
    overscan,
  });
  const state = fromStore(virtualizer);

  // The scroll region exists only after it is bound, and the count and scroll margin change, so
  // the virtualizer is told again each time. Read through `get` so this effect does not depend on
  // the store it updates.
  $effect(() => {
    const element = options.scrollElement();
    const instance = get(virtualizer);
    instance.setOptions({
      count: options.count(),
      getScrollElement: () => element,
      estimateSize: () => rowHeight,
      overscan,
      scrollMargin,
    });
    instance._willUpdate();
    instance.measure();
  });

  const items = $derived(state.current.getVirtualItems());
  const firstItem = $derived(items[0]);
  const lastItem = $derived(items.at(-1));
  const topSpacer = $derived(firstItem ? firstItem.start - scrollMargin : 0);
  const bottomSpacer = $derived(
    lastItem ? state.current.getTotalSize() - (lastItem.end - scrollMargin) : 0,
  );
  // The first row really in view (not the overscan rows above it).
  const topIndex = $derived.by(() => {
    void items;
    return state.current.range?.startIndex ?? 0;
  });

  const range = $derived.by(() => {
    void items;
    return state.current.range ?? null;
  });

  return {
    get items() {
      return items;
    },
    get topSpacer() {
      return topSpacer;
    },
    get bottomSpacer() {
      return bottomSpacer;
    },
    get topIndex() {
      return topIndex;
    },
    get scrollMargin() {
      return scrollMargin;
    },
    /** The rows really in view (not the overscan), `null` before the first layout. */
    get range() {
      return range;
    },
  };
}
