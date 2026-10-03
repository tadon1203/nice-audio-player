import type { QueryClient } from "@tanstack/svelte-query";
import { cacheScanSnapshot, refreshLibrary } from "$lib/library/events";
import { refreshLyrics } from "$lib/lyrics/events";
import type { AppEvent } from "$lib/native";

/**
 * Watches scan snapshots and refreshes what depends on the files when a scan has ended since the
 * last one seen: lyrics always, the Library only if scans changed something. Both are read from
 * counters that only grow, so a scan is never missed because the snapshots in between were
 * coalesced, and a scan that found nothing new costs no refetch. The one place that decides
 * "scan finished".
 */
export function createScanWatcher(client: QueryClient): (event: AppEvent) => void {
  let finished = 0;
  let changed = 0;
  return (event) => {
    if (event.event !== "libraryScanStateChanged") return;
    const snapshot = event.payload;
    cacheScanSnapshot(client, snapshot);
    if (snapshot.finishedCount <= finished) return;
    finished = snapshot.finishedCount;
    if (snapshot.changedCount > changed) {
      changed = snapshot.changedCount;
      refreshLibrary(client);
    }
    refreshLyrics(client);
  };
}
