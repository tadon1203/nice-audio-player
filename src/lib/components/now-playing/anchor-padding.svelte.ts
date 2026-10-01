import type { Attachment } from "svelte/attachments";
import { anchorSpacers } from "./anchor";

/**
 * Measures a scroll container for the spacers that let its first and last rows reach the anchor
 * line (40% from the top): `top` before the rows, `bottom` after them, in px. Put `attach` on the
 * container. Call during component initialization.
 */
export function createAnchorPadding() {
  let height = $state(0);
  const spacers = $derived(anchorSpacers(height));

  const attach: Attachment<HTMLElement> = (element) => {
    height = element.clientHeight;
    const observer = new ResizeObserver(() => (height = element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  };

  return {
    attach,
    /** The container's measured height in px (0 before the first measurement). */
    get height() {
      return height;
    },
    get top() {
      return spacers.top;
    },
    get bottom() {
      return spacers.bottom;
    },
  };
}
