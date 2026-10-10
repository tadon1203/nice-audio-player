import type { InfiniteData, QueryClient } from "@tanstack/svelte-query";
import { libraryQueryKeys } from "./queries";

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
