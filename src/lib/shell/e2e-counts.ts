/**
 * What the renderer has received from the backend, counted for `tests-app/` to read with
 * `browser.execute`. The app-level E2E build (`VITE_E2E=1`) keeps the counts; a normal build
 * drops this.
 *
 * `connects` counts the connections the backend answered, over every page load of the window: it
 * is kept in `sessionStorage`, so a reload makes it grow instead of starting again. The other
 * counts are of the current page.
 */
export interface E2eCounts {
  connects: number;
  stateMessages: number;
  meterFrames: number;
}

const CONNECTS_KEY = "e2e.connects";

export function countE2e(key: keyof E2eCounts): void {
  if (!import.meta.env.VITE_E2E) return;
  const counts = ((window as { __e2e?: E2eCounts }).__e2e ??= {
    connects: Number(sessionStorage.getItem(CONNECTS_KEY) ?? 0),
    stateMessages: 0,
    meterFrames: 0,
  });
  counts[key] += 1;
  if (key === "connects") sessionStorage.setItem(CONNECTS_KEY, String(counts.connects));
}
