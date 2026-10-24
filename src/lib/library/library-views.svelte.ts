import {
  type ArtistSortKey,
  type AlbumSortKey,
  type ArtistAlbumSortKey,
  type SortDirection,
  type TrackSortKey,
} from "#lib/native/bindings";
import type { SortOption } from "#lib/ui/sort-option";
import type { LibraryCatalogRequest } from "./catalog-repository";
import { Sort } from "./sort";

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";

interface SortKeyOf {
  albums: AlbumSortKey;
  albumArtists: ArtistSortKey;
  tracks: TrackSortKey;
}

/**
 * One presentation's filter and sort. Kept in memory for the life of the window, so each view
 * keeps its own filter and sort while the user moves between them.
 */
class LibraryView<Presentation extends LibraryPresentation> {
  public filter = $state("");
  public sortKey: SortKeyOf[Presentation];
  public direction: SortDirection = $state("ascending");
  /** Rows the list starts after: 0, or where the scroll index jumped to. */
  public skip = $state(0);

  readonly #presentation: Presentation;
  public readonly sortOptions: readonly SortOption<SortKeyOf[Presentation]>[];

  public constructor(
    presentation: Presentation,
    sortKey: SortKeyOf[Presentation],
    sortOptions: readonly SortOption<SortKeyOf[Presentation]>[],
  ) {
    this.#presentation = presentation;
    this.sortOptions = sortOptions;
    this.sortKey = $state.raw(sortKey);
  }

  public get request(): Extract<LibraryCatalogRequest, { presentation: Presentation }> {
    return {
      presentation: this.#presentation,
      filter: this.filter,
      sortKey: this.sortKey,
      direction: this.direction,
      skip: this.skip,
    } as Extract<LibraryCatalogRequest, { presentation: Presentation }>;
  }

  /** Identifies the sort alone, so a list can tell when its order changed. */
  public get sortSignature(): string {
    return `${this.sortKey}:${this.direction}`;
  }

  /** Identifies the filter and sort so views can reset scroll when it changes. */
  public get stateKey(): string {
    return `${this.filter}\u0000${this.sortKey}\u0000${this.direction}\u0000${this.skip}`;
  }

  public setFilter = (next: string): void => {
    this.filter = next;
    this.skip = 0;
  };

  public setSort = (key: SortKeyOf[Presentation], direction: SortDirection = "ascending"): void => {
    this.sortKey = key;
    this.direction = direction;
    this.skip = 0;
  };

  public toggleDirection = (): void => {
    this.direction = Sort.toggleDirection(this.direction);
    this.skip = 0;
  };

  /** Starts the list after `skip` rows (a letter of the scroll index); 0 is the top. */
  public jumpTo = (skip: number): void => {
    this.skip = skip;
  };
}

/** An artist's albums have a sort but no filter. */
class ArtistAlbumsView {
  public sortKey: ArtistAlbumSortKey = $state.raw("year");
  public direction: SortDirection = $state("ascending");
  public readonly sortOptions = Sort.artistAlbumOptions;

  /** Identifies the sort alone, so a list can tell when its order changed. */
  public get sortSignature(): string {
    return `${this.sortKey}:${this.direction}`;
  }

  public get stateKey(): string {
    return `${this.sortKey}\u0000${this.direction}`;
  }

  public setSort = (key: ArtistAlbumSortKey, direction: SortDirection = "ascending"): void => {
    this.sortKey = key;
    this.direction = direction;
  };

  public toggleDirection = (): void => {
    this.direction = Sort.toggleDirection(this.direction);
  };
}

/** The filter and sort of each library view, kept for the life of the window. */
export class LibraryViews {
  public readonly albums = new LibraryView("albums", "title", Sort.albumOptions);
  public readonly albumArtists = new LibraryView("albumArtists", "artist", Sort.albumArtistOptions);
  public readonly tracks = new LibraryView("tracks", "title", Sort.trackOptions);
  public readonly artistAlbums = new ArtistAlbumsView();
}
