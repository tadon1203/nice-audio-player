import type { Attachment } from "svelte/attachments";
import { untrack } from "svelte";
import type { Snapshot } from "@sveltejs/kit";

/** How long the letter index stays after the last scroll. */
const INDEX_HOLD_MS = 800;

/** How many frames to wait for the content to grow tall enough before settling for the maximum. */
export const MAX_WAIT_FRAMES = 30;

type ScrollMetrics = Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">;

/**
 * Scroll positions for the workspace. Library lists are keyed by path: leaving Albums for Tracks
 * and coming back lands where the user was. Detail pages are keyed by history entry instead
 * (SvelteKit's `snapshot`), because the same album opened twice is two different visits.
 */
export class ScrollOffsets {
  readonly #lists = new Map<string, number>();

  public rememberList(path: string, offset: number): void {
    this.#lists.set(path, offset);
  }

  /** 0 (the top) for a view that has never been scrolled. */
  public recallList(path: string): number {
    return this.#lists.get(path) ?? 0;
  }

  /** For SvelteKit `snapshot` on a detail page: `read` leaves the entry, `write` returns to it. */
  public detailSnapshot(read: () => number, write: (offset: number) => void): Snapshot<number> {
    return { capture: read, restore: write };
  }
}

export interface WorkspaceScrollOptions {
  /** Whether the content is laid out enough to restore into. */
  ready?: () => boolean;
  /** A library view's path: offsets are remembered under it and restored once on mount. */
  key?: () => string;
  /** When this changes after the first run, the region returns to the top. */
  resetKey?: () => string;
}

/**
 * One rule for a scroll region: remember the offset (under `key`), restore a pending offset once
 * the content can reach it, return to the top when `resetKey` changes, and tell whether the user
 * is scrolling. Attach `attach` to the region's viewport. Construct during component initialization.
 */
export class WorkspaceScroll {
  readonly #offsets: ScrollOffsets;
  readonly #options: WorkspaceScrollOptions;
  #viewport = $state.raw<HTMLElement | null>(null);
  #scrolling = $state(false);
  // The offset to apply once the region can reach it. A `pending` change reruns the apply effect.
  #pending = $state<number | null>(null);
  #cancel: (() => void) | null = null;
  #previousReset: string | null = null;

  public constructor(offsets: ScrollOffsets, options: WorkspaceScrollOptions) {
    this.#offsets = offsets;
    this.#options = options;
    this.#pending = options.key ? offsets.recallList(untrack(options.key)) : null;

    // Apply the pending offset once, when the region exists and its content is ready. The cancel
    // handle is not released by this effect re-running, only by a new restore, a reset or teardown.
    $effect(() => {
      const element = this.#viewport;
      const isReady = (options.ready ?? ((): true => true))();
      if (this.#pending === null || element === null || !isReady) return;
      const offset = this.#pending;
      this.#pending = null;
      if (offset === 0) return;
      this.#cancel?.();
      this.#cancel = WorkspaceScroll.scrollWhenReachable(element, offset);
    });

    $effect(() => {
      const current = options.resetKey?.() ?? null;
      const previous = this.#previousReset;
      this.#previousReset = current;
      if (previous === null || current === null || previous === current) return;
      untrack(() => {
        this.#cancel?.();
        this.#cancel = null;
        this.#pending = null;
        this.#viewport?.scrollTo({ top: 0 });
        const key = options.key?.();
        if (key !== undefined) offsets.rememberList(key, 0);
      });
    });

    $effect(() => (): void | undefined => this.#cancel?.());
  }

  /** The viewport's attachment: it remembers the offset while the user scrolls. */
  public readonly attach: Attachment<HTMLElement> = (element) => {
    this.#viewport = element;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (): void => {
      const key = this.#options.key?.();
      if (key !== undefined) this.#offsets.rememberList(key, element.scrollTop);
      this.#scrolling = true;
      clearTimeout(hold);
      hold = setTimeout(() => (this.#scrolling = false), INDEX_HOLD_MS);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      clearTimeout(hold);
      if (this.#viewport === element) this.#viewport = null;
    };
  };

  /** True while the user is scrolling, and for a moment after. */
  public get scrolling(): boolean {
    return this.#scrolling;
  }

  /** The offset now, for SvelteKit `snapshot`. */
  public readonly capture = (): number => untrack(() => this.#viewport?.scrollTop ?? 0);

  /** Applies `offset` once the content can reach it, for SvelteKit `snapshot`. */
  public readonly restore = (offset: number): void => {
    this.#cancel?.();
    this.#cancel = null;
    this.#pending = offset;
  };

  /**
   * Sets `scrollTop` to `offset` once the region is tall enough to reach it. A region cannot scroll
   * past its content, and a list's spacer or a page's data arrives a few frames after the first
   * layout; setting the offset earlier would be clamped to wherever the content ends so far.
   * Returns a function that gives up.
   */
  public static scrollWhenReachable(region: ScrollMetrics, offset: number): () => void {
    let waited = 0;
    let handle: number | null = null;
    const step = (): void => {
      handle = null;
      const reachable = region.scrollHeight - region.clientHeight >= offset;
      if (reachable || waited++ >= MAX_WAIT_FRAMES) region.scrollTop = offset;
      else handle = requestAnimationFrame(step);
    };
    step();
    return () => {
      if (handle !== null) cancelAnimationFrame(handle);
      handle = null;
    };
  }
}
