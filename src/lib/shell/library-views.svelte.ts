import type { LibraryCatalogRequest } from "$lib/library/queries";
import {
  albumArtistSortOptions,
  albumSortOptions,
  artistAlbumSortOptions,
  toggleSortDirection,
  trackSortOptions,
} from "$lib/library/sort";
import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "$lib/native";
import type { SortOption } from "$lib/ui/sort-option";

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";

type SortKeyOf = {
  albums: LibraryAlbumSortKey;
  albumArtists: LibraryAlbumArtistSortKey;
  tracks: LibraryTrackSortKey;
};

/**
 * One presentation's filter and sort. Kept in memory for the life of the window, so each view
 * keeps its own filter and sort while the user moves between them.
 */
class LibraryView<Presentation extends LibraryPresentation> {
  filter = $state("");
  sortKey: SortKeyOf[Presentation];
  direction: LibrarySortDirection = $state("ascending");
  /** Rows the list starts after: 0, or where the scroll index jumped to. */
  skip = $state(0);

  readonly #presentation: Presentation;
  readonly sortOptions: readonly SortOption<SortKeyOf[Presentation]>[];

  constructor(
    presentation: Presentation,
    sortKey: SortKeyOf[Presentation],
    sortOptions: readonly SortOption<SortKeyOf[Presentation]>[],
  ) {
    this.#presentation = presentation;
    this.sortOptions = sortOptions;
    this.sortKey = $state.raw(sortKey);
  }

  get request(): Extract<LibraryCatalogRequest, { presentation: Presentation }> {
    return {
      presentation: this.#presentation,
      filter: this.filter,
      sortKey: this.sortKey,
      direction: this.direction,
      skip: this.skip,
    } as Extract<LibraryCatalogRequest, { presentation: Presentation }>;
  }

  /** Identifies the sort alone, so a list can tell when its order changed. */
  get sortSignature(): string {
    return `${this.sortKey}:${this.direction}`;
  }

  /** Identifies the filter and sort so views can reset scroll when it changes. */
  get stateKey(): string {
    return `${this.filter}\u0000${this.sortKey}\u0000${this.direction}\u0000${this.skip}`;
  }

  setFilter = (next: string): void => {
    this.filter = next;
    this.skip = 0;
  };

  setSort = (key: SortKeyOf[Presentation], direction: LibrarySortDirection = "ascending"): void => {
    this.sortKey = key;
    this.direction = direction;
    this.skip = 0;
  };

  toggleDirection = (): void => {
    this.direction = toggleSortDirection(this.direction);
    this.skip = 0;
  };

  /** Starts the list after `skip` rows (a letter of the scroll index); 0 is the top. */
  jumpTo = (skip: number): void => {
    this.skip = skip;
  };
}

/** An artist's albums have a sort but no filter. */
class ArtistAlbumsView {
  sortKey: LibraryArtistAlbumSortKey = $state.raw("year");
  direction: LibrarySortDirection = $state("ascending");
  readonly sortOptions = artistAlbumSortOptions;

  /** Identifies the sort alone, so a list can tell when its order changed. */
  get sortSignature(): string {
    return `${this.sortKey}:${this.direction}`;
  }

  get stateKey(): string {
    return `${this.sortKey}\u0000${this.direction}`;
  }

  setSort = (
    key: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection = "ascending",
  ): void => {
    this.sortKey = key;
    this.direction = direction;
  };

  toggleDirection = (): void => {
    this.direction = toggleSortDirection(this.direction);
  };
}

class LibraryViews {
  readonly albums = new LibraryView("albums", "title", albumSortOptions);
  readonly albumArtists = new LibraryView("albumArtists", "artist", albumArtistSortOptions);
  readonly tracks = new LibraryView("tracks", "title", trackSortOptions);
  readonly artistAlbums = new ArtistAlbumsView();
}

export const libraryViews = new LibraryViews();

/** A fresh set, for tests that must not share the singleton's state. */
export function createLibraryViews(): LibraryViews {
  return new LibraryViews();
}
