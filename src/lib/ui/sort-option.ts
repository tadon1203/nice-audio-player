import type { LibrarySortDirection } from "#lib/native";

export interface SortOption<Key extends string = string> {
  readonly key: Key;
  readonly label: string;
}

/** A view the sort control can drive: its current sort, the keys it offers, and how to change it. */
export interface SortableView<Key extends string = string> {
  readonly sortKey: Key;
  readonly direction: LibrarySortDirection;
  readonly sortOptions: readonly SortOption<Key>[];
  setSort: (key: Key, direction?: LibrarySortDirection) => void;
  toggleDirection: () => void;
}
