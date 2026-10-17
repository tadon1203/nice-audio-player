import type { Attachment } from "svelte/attachments";
import { anchorSpacers } from "./anchor-column";

/**
 * Measures a scroll container for the spacers that let its first and last rows reach the anchor
 * line (40% from the top): `top` before the rows, `bottom` after them, in px. Put `attach` on the
 * container. Call during component initialization.
 */
export function createAnchorPadding(): {
  attach: Attachment<HTMLElement>;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
} {
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
    get height(): number {
      return height;
    },
    get top(): number {
      return spacers.top;
    },
    get bottom(): number {
      return spacers.bottom;
    },
  };
}
