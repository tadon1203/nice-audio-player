import type { UseQueryResult } from "@tanstack/react-query";
import type { LibraryCollectionQuery } from "@/renderer/entities/library";

export type ReadyMediaDetailsWorkspace<Summary, Item> = {
  readonly status: "ready";
  readonly summary: Summary;
  readonly items: Item[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
};

export type MediaDetailsWorkspace<Summary, Item> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown; readonly reload: () => void }
  | ReadyMediaDetailsWorkspace<Summary, Item>;

/**
 * Composes a media summary query and its paged child collection into one state.
 * Query keeps ownership of the async state; this only derives a single status,
 * with loading before error and error before ready.
 */
export function useMediaDetailsWorkspace<Summary, Item>(
  summary: UseQueryResult<Summary>,
  collection: LibraryCollectionQuery<Item>,
): MediaDetailsWorkspace<Summary, Item> {
  if (summary.isPending || collection.isPending) return { status: "loading" };
  if (summary.isError || collection.isError || summary.data === undefined) {
    return {
      status: "error",
      error: summary.error ?? collection.error,
      reload: () => void Promise.all([summary.refetch(), collection.refetch()]),
    };
  }
  return {
    status: "ready",
    summary: summary.data,
    items: collection.items,
    hasMore: collection.hasNextPage,
    loadingMore: collection.isFetchingNextPage,
    loadMore: () => void collection.fetchNextPage(),
  };
}
