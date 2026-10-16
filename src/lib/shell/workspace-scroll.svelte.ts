import type { Attachment } from "svelte/attachments";
import { untrack } from "svelte";
import type { ScrollMemory } from "./scroll-memory";

/** How long the scroll index stays after the last scroll. */
const INDEX_HOLD_MS = 800;

/** How many frames to wait for the content to grow tall enough before settling for the maximum. */
export const MAX_WAIT_FRAMES = 30;

export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

type ScrollRegion = Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">;

export type WorkspaceScrollOptions = {
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
 * is scrolling. Attach `attach` to the region's viewport. Construct during component initialization.
 */
export class WorkspaceScroll {
  readonly #memory: ScrollMemory;
  readonly #options: WorkspaceScrollOptions;
  #viewport = $state.raw<HTMLElement | null>(null);
  #scrolling = $state(false);
  // Bumped by `restore` so the apply effect runs again.
  #requests = $state(0);
  #pending: number | null;
  #cancel: (() => void) | null = null;
  #previousReset: string | null = null;

  public constructor(memory: ScrollMemory, options: WorkspaceScrollOptions) {
    this.#memory = memory;
    this.#options = options;
    this.#pending = options.key ? memory.recallList(untrack(options.key)) : null;

    // Apply the pending offset once, when the region exists and its content is ready. The cancel
    // handle is not released by this effect re-running, only by a new restore, a reset or teardown.
    $effect(() => {
      void this.#requests;
      const element = this.#viewport;
      const isReady = (options.ready ?? (() => true))();
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
        if (key !== undefined) memory.rememberList(key, 0);
      });
    });

    $effect(() => () => this.#cancel?.());
  }

  /** The viewport's attachment: it remembers the offset while the user scrolls. */
  public readonly attach: Attachment<HTMLElement> = (element) => {
    this.#viewport = element;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const key = this.#options.key?.();
      if (key !== undefined) this.#memory.rememberList(key, element.scrollTop);
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
    this.#requests++;
  };

  /**
   * Sets `scrollTop` to `offset` once the region is tall enough to reach it. A region cannot scroll
   * past its content, and a list's spacer or a page's data arrives a few frames after the first
   * layout; setting the offset earlier would be clamped to wherever the content ends so far.
   * Returns a function that gives up.
   */
  public static scrollWhenReachable(
    region: ScrollRegion,
    offset: number,
    frames: FrameScheduler = browserFrames,
  ): () => void {
    let waited = 0;
    let handle: number | null = null;
    const step = () => {
      handle = null;
      const reachable = region.scrollHeight - region.clientHeight >= offset;
      if (reachable || waited++ >= MAX_WAIT_FRAMES) region.scrollTop = offset;
      else handle = frames.request(step);
    };
    step();
    return () => {
      if (handle !== null) frames.cancel(handle);
      handle = null;
    };
  }
}
