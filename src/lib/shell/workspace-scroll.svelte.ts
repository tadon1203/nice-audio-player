import { untrack } from "svelte";
import { recallScroll, rememberScroll, scrollWhenReachable } from "./workspace-scroll-model";

/** How long the scroll index stays after the last scroll. */
const INDEX_HOLD_MS = 800;

type WorkspaceScrollOptions = {
  /** The scroll region (`null` while it is still mounting). */
  viewport: () => HTMLElement | null;
  /** Whether the content is laid out enough to restore into. */
  ready?: () => boolean;
  /** A library view's path: offsets are remembered under it and restored once on mount. */
  key?: () => string;
  /** When this changes after the first run, the region returns to the top. */
  resetKey?: () => string;
};

/**
 * One rule for a scroll region: remember the offset (under `key`), restore a pending offset once
 * the content can reach it, return to the top when `resetKey` changes, and tell whether the user
 * is scrolling. Call during component init.
 */
export function createWorkspaceScroll(options: WorkspaceScrollOptions) {
  const ready = options.ready ?? (() => true);
  let scrolling = $state(false);
  // Bumped by `restore` so the apply effect runs again.
  let requests = $state(0);
  let pending: number | null = options.key ? recallScroll(untrack(options.key)) : null;
  let cancel: (() => void) | null = null;

  $effect(() => {
    const element = options.viewport();
    if (element === null) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const key = options.key?.();
      if (key !== undefined) rememberScroll(key, element.scrollTop);
      scrolling = true;
      clearTimeout(hold);
      hold = setTimeout(() => (scrolling = false), INDEX_HOLD_MS);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      clearTimeout(hold);
    };
  });

  // Apply the pending offset once, when the region exists and its content is ready. The cancel
  // handle is not released by this effect re-running, only by a new restore, a reset or teardown.
  $effect(() => {
    void requests;
    const element = options.viewport();
    const isReady = ready();
    if (pending === null || element === null || !isReady) return;
    const offset = pending;
    pending = null;
    if (offset === 0) return;
    cancel?.();
    cancel = scrollWhenReachable(element, offset);
  });

  let previousReset: string | null = null;
  $effect(() => {
    const current = options.resetKey?.() ?? null;
    const previous = previousReset;
    previousReset = current;
    if (previous === null || current === null || previous === current) return;
    untrack(() => {
      cancel?.();
      cancel = null;
      pending = null;
      options.viewport()?.scrollTo({ top: 0 });
      const key = options.key?.();
      if (key !== undefined) rememberScroll(key, 0);
    });
  });

  $effect(() => () => cancel?.());

  return {
    get scrolling() {
      return scrolling;
    },
    capture(): number {
      return untrack(() => options.viewport()?.scrollTop ?? 0);
    },
    restore(offset: number): void {
      cancel?.();
      cancel = null;
      pending = offset;
      requests++;
    },
  };
}
