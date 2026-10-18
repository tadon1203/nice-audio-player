import { getContext, setContext } from "svelte";
import type { Attachment } from "svelte/attachments";

const CONTEXT_KEY = Symbol("scroll-view");

/**
 * A view that scrolls: the viewport that scrolls, and the content inside it, whose size
 * changes move whatever sits in the content. The component that owns the view provides it with
 * `provide` and attaches the two; the lists inside read it with `current`, so none of them is
 * handed an element.
 */
export class ScrollView {
  #viewport = $state.raw<HTMLElement | null>(null);
  #content = $state.raw<HTMLElement | null>(null);

  /** Creates the scroll view of the component being initialised, for everything inside it. */
  public static provide(): ScrollView {
    const scrollView = new ScrollView();
    setContext(CONTEXT_KEY, scrollView);
    return scrollView;
  }

  /** The scroll view the component being initialised sits in. */
  public static current(): ScrollView {
    const scrollView = getContext<ScrollView | undefined>(CONTEXT_KEY);
    if (scrollView === undefined) throw new Error("No scroll view above this component.");
    return scrollView;
  }

  /** The element that scrolls. */
  public readonly attachViewport: Attachment<HTMLElement> = (node) => {
    this.#viewport = node;
    return (): void => {
      if (this.#viewport === node) this.#viewport = null;
    };
  };

  /** The element holding everything that scrolls. */
  public readonly attachContent: Attachment<HTMLElement> = (node) => {
    this.#content = node;
    return (): void => {
      if (this.#content === node) this.#content = null;
    };
  };

  /** `null` while the scroll view is still mounting. */
  public get viewport(): HTMLElement | null {
    return this.#viewport;
  }

  /** `null` while the scroll view is still mounting. */
  public get content(): HTMLElement | null {
    return this.#content;
  }
}
