import { useCallback, useState } from "react";

/** Where "now" sits in a scrolling column: this fraction of its height from the top. */
export const ANCHOR_FRACTION = 0.4;

/**
 * Measures a scroll container and returns the CSS variables that let its first and last rows
 * reach the anchor line: `--anchor-top` (40% of the height) and `--anchor-bottom` (the other
 * 60%). Put a spacer of each height before and after the rows. Attach `ref` to the container and
 * spread `style` onto it.
 */
export function useAnchorPadding() {
  const [height, setHeight] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    setHeight(element.clientHeight);
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {
    ref,
    /** The container's measured height in px (0 before the first measurement). */
    height,
    style: {
      "--anchor-top": `${height * ANCHOR_FRACTION}px`,
      "--anchor-bottom": `${height * (1 - ANCHOR_FRACTION)}px`,
    } as React.CSSProperties,
  };
}
