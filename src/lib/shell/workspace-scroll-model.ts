/**
 * The pure half of workspace scrolling: the offsets remembered per library view, and applying an
 * offset once the region can actually reach it. An offset is the scroll region's `scrollTop`.
 *
 * Library views are keyed by path: leaving Albums for Tracks and coming back lands where the user
 * was. Detail pages are keyed by history entry instead (SvelteKit's `snapshot`), because the same
 * album opened twice is two different visits.
 */
const offsets = new Map<string, number>();

export function rememberScroll(key: string, offset: number): void {
  offsets.set(key, offset);
}

/** 0 (the top) for a view that has never been scrolled. */
export function recallScroll(key: string): number {
  return offsets.get(key) ?? 0;
}

export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** How many frames to wait for the content to grow tall enough before settling for the maximum. */
export const MAX_WAIT_FRAMES = 30;

type ScrollRegion = Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">;

/**
 * Sets `scrollTop` to `offset` once the region is tall enough to reach it. A region cannot scroll
 * past its content, and a list's spacer or a page's data arrives a few frames after the first
 * layout; setting the offset earlier would be clamped to wherever the content ends so far.
 * Returns a function that gives up.
 */
export function scrollWhenReachable(
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
