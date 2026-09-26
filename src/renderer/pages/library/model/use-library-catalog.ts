import { useDeferredValue, useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  libraryStatusMessage,
  useLibraryPresentationQuery,
  useLibraryStatus,
  type LibraryCatalogItem,
  type LibraryCatalogRequest,
  type LibraryCollectionQuery,
  type LibraryStatus,
} from "@/renderer/entities/library";

/** Which single region owns the workspace; states never compete. */
export type LibraryViewState =
  | "loading"
  | "statusError"
  | "unavailable"
  | "catalogError"
  | "empty"
  | "content";

export type LibraryCatalogState<Item> = {
  statusQuery: UseQueryResult<LibraryStatus>;
  /** Why the library cannot be browsed, when its status says so. */
  statusMessage: string | null;
  query: LibraryCollectionQuery<Item>;
  viewState: LibraryViewState;
  /** True while the list refetches behind existing content. */
  updating: boolean;
};

/**
 * Loads a presentation once the library is ready and derives the one view state
 * to render. The filter is deferred so typing stays responsive while the list refetches.
 */
export function useLibraryCatalog<Request extends LibraryCatalogRequest>(
  request: Request,
): LibraryCatalogState<LibraryCatalogItem<Request["presentation"]>> {
  const deferredFilter = useDeferredValue(request.filter);
  const statusQuery = useLibraryStatus();
  const statusMessage = statusQuery.data ? libraryStatusMessage(statusQuery.data) : null;
  const { presentation, sortKey, direction } = request;
  const deferredRequest = useMemo(
    () => ({ presentation, sortKey, direction, filter: deferredFilter }) as Request,
    [presentation, sortKey, direction, deferredFilter],
  );
  const query = useLibraryPresentationQuery(deferredRequest, statusQuery.data?.status === "ready");

  const viewState: LibraryViewState = statusQuery.isError
    ? "statusError"
    : statusMessage !== null
      ? "unavailable"
      : statusQuery.isPending || query.isPending
        ? "loading"
        : query.isError
          ? "catalogError"
          : query.items.length === 0
            ? "empty"
            : "content";
  const settled = viewState === "content" || viewState === "empty" || viewState === "catalogError";

  return {
    statusQuery,
    statusMessage,
    query,
    viewState,
    updating: settled && !query.isFetchingNextPage && (query.isFetching || query.isPlaceholderData),
  };
}
