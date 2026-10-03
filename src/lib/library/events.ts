import type { InfiniteData, QueryClient } from "@tanstack/svelte-query";
import type { LibraryScanSnapshot } from "$lib/native";
import { libraryQueryKeys } from "./queries";

/**
 * Replaces the cached scan state with a pushed snapshot. A fetch still in flight would resolve
 * with older data and overwrite it, so it is cancelled first.
 */
export function cacheScanSnapshot(client: QueryClient, snapshot: LibraryScanSnapshot) {
  void client.cancelQueries({ queryKey: libraryQueryKeys.scan });
  client.setQueryData(libraryQueryKeys.scan, snapshot);
}

/**
 * Refetches everything the catalog serves. A list scrolled deep would refetch every loaded page,
 * one request after another (each needs the cursor of the one before), so lists start over from
 * their first page and load the rest as they are scrolled to again.
 */
export function refreshLibrary(client: QueryClient) {
  client.setQueriesData<InfiniteData<unknown>>(
    { queryKey: [...libraryQueryKeys.data, "catalog"] },
    (data) =>
      data === undefined || data.pages.length <= 1
        ? data
        : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
  void client.invalidateQueries({ queryKey: libraryQueryKeys.data });
}
