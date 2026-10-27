import type {
  AlbumListItem,
  AlbumSortKey,
  ArtistAlbumSortKey,
  ArtistId,
  ArtistListItem,
  ArtistSortKey,
  CommandError,
  LetterIndexEntry,
  SortDirection,
  TrackListItem,
  TrackSortKey,
} from "#lib/native/bindings";

/** A page of a list: its rows, how long the whole list is, and the Library version it was read at. */
export interface Page<Item> {
  readonly items: readonly Item[];
  readonly total: number;
  readonly version: number;
}

export type CatalogPage = Page<AlbumListItem> | Page<ArtistListItem> | Page<TrackListItem>;

/** The catalog item type for a presentation. */
export type LibraryCatalogItem<Presentation extends LibraryCatalogRequest["presentation"]> = {
  albums: AlbumListItem;
  albumArtists: ArtistListItem;
  tracks: TrackListItem;
}[Presentation];

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";

export type LibraryCatalogRequest =
  | {
      readonly presentation: "albums";
      readonly filter: string;
      readonly sortKey: AlbumSortKey;
      readonly direction: SortDirection;
      /** The row the list starts at: 0, or the start of a letter of its letter index. */
      readonly skip: number;
    }
  | {
      readonly presentation: "albumArtists";
      readonly filter: string;
      readonly sortKey: ArtistSortKey;
      readonly direction: SortDirection;
      readonly skip: number;
    }
  | {
      readonly presentation: "tracks";
      readonly filter: string;
      readonly sortKey: TrackSortKey;
      readonly direction: SortDirection;
      readonly skip: number;
    };

/** Which single region owns the workspace; states never compete. */
export type LibraryViewState = "loading" | "unavailable" | "catalogError" | "empty" | "content";

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

/** The arguments of an Album Artist's album list: which artist, and how its albums are ordered. */
export interface ArtistAlbumsRequest {
  readonly artistId: ArtistId;
  readonly sortKey: ArtistAlbumSortKey;
  readonly direction: SortDirection;
}
