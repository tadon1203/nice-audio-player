import { useCallback } from "react";
import type { LibraryAlbumArtistSummary } from "@/bindings";
import type { LibraryBrowseClient } from "./LibraryWorkspace";
import { usePagedLibraryQuery, type PagedLibraryQueryOptions } from "./use-paged-library-query";
import { formatLibraryQueryError } from "./library-query-error";

export function useAlbumArtistQuery(
  search: string,
  libraryRefreshKey: number,
  enabled: boolean,
  client: LibraryBrowseClient,
  options?: PagedLibraryQueryOptions,
) {
  const loadPage = useCallback(
    (cursor: string | null) => client.listAlbumArtists(cursor, search || null),
    [client, search],
  );
  const query = usePagedLibraryQuery<LibraryAlbumArtistSummary, string>(
    loadPage,
    `album-artists:${search}:${libraryRefreshKey}`,
    enabled,
    options,
  );
  return {
    ...query,
    error: query.error ? formatLibraryQueryError(query.error, "album artists") : null,
  };
}
