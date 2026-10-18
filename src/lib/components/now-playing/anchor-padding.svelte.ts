import type { Attachment } from "svelte/attachments";
import { AnchorColumn } from "./anchor-column";

/**
 * Measures a scroll container for the spacers that let its first and last rows reach the anchor
 * line (40% from the top): `top` before the rows, `bottom` after them, in px. Put `attach` on the
 * container. Construct it while a component initialises.
 */
export class AnchorPadding {
  #height = $state(0);
  readonly #spacers = $derived(AnchorColumn.spacers(this.#height));

  /** Measures the container and keeps its height up to date. */
  public readonly attach: Attachment<HTMLElement> = (element) => {
    this.#height = element.clientHeight;
    const observer = new ResizeObserver(() => (this.#height = element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  };

  /** The container's measured height in px (0 before the first measurement). */
  public get height(): number {
    return this.#height;
  }

  public get top(): number {
    return this.#spacers.top;
  }

  public get bottom(): number {
    return this.#spacers.bottom;
  }
}
