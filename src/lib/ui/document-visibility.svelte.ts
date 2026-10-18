import { createSubscriber } from "svelte/reactivity";

/**
 * Whether the window is visible: a hidden or minimized window is not. Reading `visible` in a
 * reactive context (an effect or a derived value) keeps it up to date, and only while it is read.
 */
export class DocumentVisibility {
  readonly #subscribe = createSubscriber((update) => {
    document.addEventListener("visibilitychange", update);
    return (): void => document.removeEventListener("visibilitychange", update);
  });

  public get visible(): boolean {
    this.#subscribe();
    return typeof document === "undefined" ? true : document.visibilityState === "visible";
  }
}
