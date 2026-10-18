import type { LibraryIndexBucket } from "#lib/native";
import type { LibraryViewState } from "./library-catalog.svelte";

export interface LibraryPresentationMeta {
  title: string;
  singular: string;
  plural: string;
  searchLabel: string;
  searchPlaceholder: string;
}

export interface LibraryScroll {
  /** The list reports the index of its first visible item here (for the scroll index). */
  ontopindexchange: (index: number) => void;
}

/** What the workspace reads from `LibraryCatalog`. */
export interface WorkspaceCatalog<Item> {
  statusError: unknown;
  refetchStatus: () => Promise<unknown>;
  statusMessage: string | null;
  viewState: LibraryViewState;
  updating: boolean;
  items: readonly Item[];
  totalCount: number | null;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
  /** The scroll index of the list's order; empty when the sort has none. */
  index: readonly LibraryIndexBucket[];
}
