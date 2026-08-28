import { useCallback } from "react";
import { listLibraryAlbums } from "@/api/library";
import type { LibraryAlbumSummary } from "@/bindings";
import { usePagedLibraryQuery } from "./use-paged-library-query";
import type { LibraryBrowseClient } from "./LibraryWorkspace";
import type { PagedLibraryQueryOptions } from "./use-paged-library-query";
import { formatLibraryQueryError } from "./library-query-error";

export function useAlbumQuery(
  search: string,
  libraryRefreshKey: number,
  enabled = true,
  client?: LibraryBrowseClient,
  options?: PagedLibraryQueryOptions,
) {
  const loadPage = useCallback(
    (cursor: string | null) => (client?.listAlbums ?? listLibraryAlbums)(cursor, search || null),
    [client, search],
  );
  const query = usePagedLibraryQuery<LibraryAlbumSummary, string>(
    loadPage,
    `albums:${search}:${libraryRefreshKey}`,
    enabled,
    options,
  );
  return {
    ...query,
    error: query.error ? formatLibraryQueryError(query.error, "albums") : null,
  };
}
