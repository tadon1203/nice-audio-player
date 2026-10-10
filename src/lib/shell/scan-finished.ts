import type { QueryClient } from "@tanstack/svelte-query";
import { refreshLibrary } from "$lib/library/events";
import type { LibraryScanState } from "$lib/library/library-scan-state.svelte";
import { refreshLyrics } from "$lib/lyrics/events";
import type { LibraryScanSnapshot } from "$lib/native";

/**
 * Keeps the scan state and refreshes what depends on the files when a scan has ended since the
 * last one seen: lyrics always, the Library only if scans changed something. Both are read from
 * counters that only grow, so a scan is never missed because the snapshots in between were
 * coalesced, and a scan that found nothing new costs no refetch. The one place that decides
 * "scan finished".
 */
export function createScanWatcher(
  client: QueryClient,
  scan: LibraryScanState,
): (snapshot: LibraryScanSnapshot) => void {
  let finished = 0;
  let changed = 0;
  return (snapshot) => {
    scan.snapshot = snapshot;
    if (snapshot.finishedCount <= finished) return;
    finished = snapshot.finishedCount;
    if (snapshot.changedCount > changed) {
      changed = snapshot.changedCount;
      refreshLibrary(client);
    }
    refreshLyrics(client);
  };
}
