import { type CommandError, type LetterIndexEntry } from "#lib/native/bindings";
import type { LibraryViewState } from "./library-catalog.svelte";

export interface LibraryPresentationMeta {
  title: string;
  singular: string;
  plural: string;
  searchLabel: string;
  searchPlaceholder: string;
}

export interface LibraryScroll {
  /** The list reports the index of its first visible item here (for the letter index). */
  ontopindexchange: (index: number) => void;
}

/** What the workspace reads from `LibraryCatalog`. */
export interface WorkspaceCatalog<Item> {
  statusMessage: string | null;
  viewState: LibraryViewState;
  updating: boolean;
  items: readonly Item[];
  totalCount: number | null;
  error: CommandError | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  refetch: () => Promise<void>;
  /** The letter index of the list's order; empty when the sort has none. */
  index: readonly LetterIndexEntry[];
}
