import { useCallback } from "react";
import { listLibraryTracks } from "@/api/library";
import type { LibraryTrackSummary } from "@/bindings";
import { usePagedLibraryQuery } from "./use-paged-library-query";
import type { LibraryBrowseClient } from "./LibraryWorkspace";
import type { PagedLibraryQueryOptions } from "./use-paged-library-query";
import { formatLibraryQueryError } from "./library-query-error";

export function useTrackQuery(
  search: string,
  libraryRefreshKey: number,
  enabled = true,
  client?: LibraryBrowseClient,
  options?: PagedLibraryQueryOptions,
) {
  const loadPage = useCallback(
    async (cursor: string | null) => {
      const page = await (client?.listTracks ?? listLibraryTracks)(cursor, search || null);
      return { items: page.items, nextCursor: page.nextAfterId };
    },
    [client, search],
  );
  const query = usePagedLibraryQuery<LibraryTrackSummary, string>(
    loadPage,
    `tracks:${search}:${libraryRefreshKey}`,
    enabled,
    options,
  );
  return {
    ...query,
    nextAfterId: query.nextCursor,
    error: query.error ? formatLibraryQueryError(query.error, "tracks") : null,
  };
}
