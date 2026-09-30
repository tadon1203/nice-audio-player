import { createVirtualizer } from "@tanstack/svelte-virtual";
import { fromStore, get } from "svelte/store";

type VirtualRowsOptions = {
  count: () => number;
  /** The region the rows scroll in (`null` while it is still mounting). */
  scrollElement: () => HTMLElement | null;
  /** Fixed row height in px; rows are placed by arithmetic. */
  rowHeight: number;
  overscan: number;
  initialOffset: () => number;
  /** The element whose size changes re-measure the scroll margin. */
  container: () => HTMLElement | null;
  /** The element holding the rows; its top is where the first row sits. */
  body: () => HTMLElement | null;
};

/**
 * Virtualizes fixed-height rows inside a scroll region: which rows to render, the spacer heights
 * above and below them, and the restore of the initial scroll offset. Call during component init.
 */
export function createVirtualRows(options: VirtualRowsOptions) {
  const { rowHeight, overscan } = options;
  let measured = $state(false);
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
      measured = true;
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

  // The region cannot scroll further than the spacer the virtualizer has produced, which arrives
  // a frame or two after the first layout; wait for it before applying the offset.
  let restored = false;
  $effect(() => {
    const element = options.scrollElement();
    if (restored || element === null || !measured) return;
    restored = true;
    const initialOffset = options.initialOffset();
    if (initialOffset === 0) return;
    let frames = 0;
    let frame = 0;
    const step = () => {
      const reachable = element.scrollHeight - element.clientHeight >= initialOffset;
      if (reachable || frames++ > 30) element.scrollTop = initialOffset;
      else frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
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
  };
}
