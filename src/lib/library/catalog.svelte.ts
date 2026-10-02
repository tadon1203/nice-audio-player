import {
  createInfiniteQuery,
  createQuery,
  type CreateInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/svelte-query";
import { libraryStatusMessage } from "./library-errors";
import {
  flattenPages,
  libraryQueryOptions,
  requestOfCatalogKey,
  type LibraryCatalogItem,
  type LibraryCatalogRequest,
  type Page,
} from "./queries";

/** Which single region owns the workspace; states never compete. */
export type LibraryViewState =
  | "loading"
  | "statusError"
  | "unavailable"
  | "catalogError"
  | "empty"
  | "content";

/** How long typing pauses before the filter reaches the query. The input itself never waits. */
const FILTER_DEBOUNCE_MS = 120;

/**
 * The loaded pages of an infinite query as one list with paging state. Reads go through getters,
 * so a reader only depends on what it touches.
 */
export function collectionOf<TPage extends Page<unknown>>(
  query: CreateInfiniteQueryResult<InfiniteData<TPage>, Error>,
) {
  const items = $derived<TPage["items"][number][]>(flattenPages(query.data));
  return {
    get items() {
      return items;
    },
    get totalCount() {
      return query.data?.pages[0]?.totalCount ?? null;
    },
    get nextCursor() {
      return query.data?.pages.at(-1)?.nextCursor ?? null;
    },
    get isPending() {
      return query.isPending;
    },
    get isFetching() {
      return query.isFetching;
    },
    get isPlaceholderData() {
      return query.isPlaceholderData;
    },
    get isError() {
      return query.isError;
    },
    get error() {
      return query.error;
    },
    get hasNextPage() {
      return query.hasNextPage;
    },
    get isFetchingNextPage() {
      return query.isFetchingNextPage;
    },
    fetchNextPage: () => query.fetchNextPage(),
    refetch: () => query.refetch(),
  };
}

export type LibraryCollection<Item> = ReturnType<typeof collectionOf<Page<Item>>>;

/**
 * Loads a presentation once the library is ready and derives the one view state to render.
 * The filter is debounced into the query key so typing stays responsive while the list
 * refetches; the previous list of the same presentation stays on screen until the new one
 * arrives. Call during component initialization.
 */
export function createLibraryCatalog<Request extends LibraryCatalogRequest>(
  request: () => Request,
) {
  const statusQuery = createQuery(() => libraryQueryOptions.status());
  const statusMessage = $derived(statusQuery.data ? libraryStatusMessage(statusQuery.data) : null);

  // The debounced filter is remembered with its presentation, so switching views never applies
  // the other view's filter to this one.
  let settled = $state.raw({ presentation: request().presentation, filter: request().filter });
  $effect(() => {
    const { presentation, filter } = request();
    const timer = setTimeout(() => (settled = { presentation, filter }), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });
  const queryRequest = $derived.by(() => {
    const current = request();
    return settled.presentation === current.presentation
      ? ({ ...current, filter: settled.filter } as Request)
      : current;
  });

  // Keep the previous list only while the presentation stays the same.
  const keepWithinPresentation = <Data>(
    previousData: Data | undefined,
    previousQuery: { queryKey: readonly unknown[] } | undefined,
  ): Data | undefined =>
    previousQuery !== undefined &&
    requestOfCatalogKey(previousQuery.queryKey).presentation === queryRequest.presentation
      ? previousData
      : undefined;

  const query = createInfiniteQuery(() => ({
    ...libraryQueryOptions.catalog(queryRequest, statusQuery.data?.status === "ready"),
    placeholderData: keepWithinPresentation,
  }));
  // The query function is chosen by `presentation`, so its pages hold exactly that
  // presentation's item type; TypeScript cannot correlate the two through the union.
  const collection = collectionOf(query) as unknown as LibraryCollection<
    LibraryCatalogItem<Request["presentation"]>
  >;

  const viewState = $derived<LibraryViewState>(
    statusQuery.isError
      ? "statusError"
      : statusMessage !== null
        ? "unavailable"
        : statusQuery.isPending || collection.isPending
          ? "loading"
          : collection.isError
            ? "catalogError"
            : collection.items.length === 0
              ? "empty"
              : "content",
  );
  const updating = $derived(
    (viewState === "content" || viewState === "empty" || viewState === "catalogError") &&
      !collection.isFetchingNextPage &&
      (collection.isFetching || collection.isPlaceholderData),
  );

  return {
    get statusQuery() {
      return statusQuery;
    },
    /** Why the library cannot be browsed, when its status says so. */
    get statusMessage(): string | null {
      return statusMessage;
    },
    get viewState(): LibraryViewState {
      return viewState;
    },
    /** True while the list refetches behind existing content. */
    get updating(): boolean {
      return updating;
    },
    get items() {
      return collection.items;
    },
    get totalCount() {
      return collection.totalCount;
    },
    get nextCursor() {
      return collection.nextCursor;
    },
    get error() {
      return collection.error;
    },
    get hasNextPage() {
      return collection.hasNextPage;
    },
    get isFetchingNextPage() {
      return collection.isFetchingNextPage;
    },
    fetchNextPage: collection.fetchNextPage,
    refetch: collection.refetch,
  };
}
