/**
 * Explicit scroll memory, replacing the router's scroll restoration. An offset is the scroll
 * region's `scrollTop`, the same value `WorkspaceScroll` reported to the list as its initial
 * offset before.
 *
 * Library views are keyed by path: leaving Albums for Tracks and coming back lands where the
 * user was, however they came back. The layout calls `rememberScroll(path, viewport.scrollTop)`
 * on scroll (or before navigating away) and `recallScroll(path)` when the view mounts.
 *
 * Detail pages are keyed by history entry instead, because the same album opened twice is two
 * different visits: Back restores the old one, a fresh link starts at the top. SvelteKit's
 * `snapshot` is exactly per entry, so a detail `+page.svelte` does:
 *
 *   let viewport = $state<HTMLElement | null>(null);
 *   export const snapshot = {
 *     capture: () => captureScroll(viewport),
 *     restore: (offset: number) => restoreScroll(viewport, offset),
 *   };
 *
 * Settings has no list to rebuild, so it can use the same pair.
 */
const offsets = new Map<string, number>();

export function rememberScroll(key: string, offset: number): void {
  offsets.set(key, offset);
}

/** 0 (the top) for a view that has never been scrolled. */
export function recallScroll(key: string): number {
  return offsets.get(key) ?? 0;
}

export function captureScroll(viewport: HTMLElement | null): number {
  return viewport?.scrollTop ?? 0;
}

export function restoreScroll(viewport: HTMLElement | null, offset: number): void {
  viewport?.scrollTo({ top: offset });
}
