import type { QueryClient } from "@tanstack/svelte-query";
import { cacheScanSnapshot, isScanFinished, refreshLibrary } from "$lib/library/events";
import { refreshLyrics } from "$lib/lyrics/events";
import type { AppEvent, LibraryScanState } from "$lib/native";

/**
 * Watches scan snapshots and, the first time one reports a finished scan, refreshes everything
 * that depends on the files: the Library and lyrics. The one place that decides "scan finished".
 */
export function createScanWatcher(client: QueryClient): (event: AppEvent) => void {
  let previous: LibraryScanState | undefined;
  return (event) => {
    if (event.event !== "libraryScanStateChanged") return;
    const next = event.payload.state;
    cacheScanSnapshot(client, event.payload);
    if (isScanFinished(next) && previous !== next) {
      refreshLibrary(client);
      refreshLyrics(client);
    }
    previous = next;
  };
}
