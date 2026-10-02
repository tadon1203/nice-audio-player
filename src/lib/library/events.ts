import type { QueryClient } from "@tanstack/svelte-query";
import type { LibraryScanSnapshot, LibraryScanState } from "$lib/native";
import { libraryQueryKeys } from "./queries";

const finishedScanStates: readonly LibraryScanState[] = ["completed", "cancelled", "failed"];

/** Whether a scan has stopped running: the moment the catalog may have changed. */
export const isScanFinished = (state: LibraryScanState) => finishedScanStates.includes(state);

/**
 * Replaces the cached scan state with a pushed snapshot. A fetch still in flight would resolve
 * with older data and overwrite it, so it is cancelled first.
 */
export function cacheScanSnapshot(client: QueryClient, snapshot: LibraryScanSnapshot) {
  void client.cancelQueries({ queryKey: libraryQueryKeys.scan });
  client.setQueryData(libraryQueryKeys.scan, snapshot);
}

/** Refetches everything the catalog serves. */
export function refreshLibrary(client: QueryClient) {
  void client.invalidateQueries({ queryKey: libraryQueryKeys.data });
}
