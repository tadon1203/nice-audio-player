/**
 * What the renderer has received from the backend, counted for `tests-app/` to read with
 * `browser.execute`. The app-level E2E build (`VITE_E2E=1`) keeps the counts; a normal build
 * drops this.
 */
export type E2eCounts = { connects: number; stateMessages: number; meterFrames: number };

export function countE2e(key: keyof E2eCounts) {
  if (!import.meta.env.VITE_E2E) return;
  const counts = ((window as { __e2e?: E2eCounts }).__e2e ??= {
    connects: 0,
    stateMessages: 0,
    meterFrames: 0,
  });
  counts[key] += 1;
}
