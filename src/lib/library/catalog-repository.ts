import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type AlbumListItem,
  type AlbumSortKey,
  type ArtistListItem,
  type ArtistSortKey,
  type LetterIndexEntry,
  type SortDirection,
  type TrackListItem,
  type TrackSortKey,
  type TrackId,
} from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import { LibraryQueryKeys } from "./library-query-keys";
import { type TrackProperties } from "#lib/native/bindings";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** How many rows one page asks for. */
export const PAGE_SIZE = 100;

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

/** The catalog lists and their letter indexes: the data the Library browses. */
export class CatalogRepository {
  readonly #library: typeof library;
  readonly #queryClient: QueryClient;

  public constructor(libraryCommands: typeof library, queryClient: QueryClient) {
    this.#library = libraryCommands;
    this.#queryClient = queryClient;
  }

  /**
   * The pages of a list, by offset. The first page starts at `request.skip`; each next one starts
   * after the rows loaded so far. A page read at another Library version than the first one's
   * means the list changed under it, so the list starts over from its first page.
   */
  public pageOptions(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): CreateInfiniteQueryOptions<
    Result<CatalogPage>,
    Error,
    InfiniteData<Result<CatalogPage>, unknown>,
    readonly unknown[],
    number
  > & {
    initialData?:
      | InfiniteData<Result<CatalogPage>, number>
      | InitialDataFunction<InfiniteData<Result<CatalogPage>, number>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<Result<CatalogPage>, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.catalog(request),
      initialPageParam: request.skip,
      queryFn: async ({ pageParam, queryKey }) => {
        const outcome = await this.#listPage(request, pageParam);
        const first =
          this.#queryClient.getQueryData<InfiniteData<Result<CatalogPage>, number>>(queryKey)
            ?.pages[0];
        // A page read at another Library version means the list changed under the pages before it.
        if (
          outcome.ok &&
          pageParam !== request.skip &&
          first?.ok &&
          first.value.version !== outcome.value.version
        ) {
          void this.#queryClient.resetQueries({ queryKey, exact: true }).catch(() => undefined);
        }
        return outcome;
      },
      // A failed page has no next page to ask for: the list stops at it and shows its error.
      getNextPageParam: (last: Result<CatalogPage>, _pages, lastPageParam: number) => {
        if (!last.ok) return undefined;
        const next = lastPageParam + last.value.items.length;
        return next < last.value.total ? next : undefined;
      },
      enabled,
    });
  }

  public indexOptions(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): CreateQueryOptions<
    Result<LetterIndexEntry[]>,
    Error,
    Result<LetterIndexEntry[]>,
    readonly unknown[]
  > & {
    initialData?:
      | Result<LetterIndexEntry[]>
      | InitialDataFunction<Result<LetterIndexEntry[]>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], Result<LetterIndexEntry[]>, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.catalogIndex(request),
      queryFn: () => this.#listIndex(request),
      enabled,
    });
  }

  public trackPropertiesOptions(trackId: TrackId | null): CreateQueryOptions<
    Result<TrackProperties>,
    Error,
    Result<TrackProperties>,
    readonly unknown[]
  > & {
    initialData?:
      | Result<TrackProperties>
      | InitialDataFunction<Result<TrackProperties>>
      | null
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], Result<TrackProperties>, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.trackProperties(trackId),
      queryFn:
        trackId === null
          ? skipToken
          : (): Promise<Result<TrackProperties>> => this.#library.trackProperties(trackId),
    });
  }

  /** Representative artwork color as `#rrggbb`, for backgrounds only. */
  public accentOptions(path: string | null): CreateQueryOptions<
    Result<string | null>,
    Error,
    Result<string | null>,
    readonly unknown[]
  > & {
    initialData?: Result<string | null> | InitialDataFunction<Result<string | null>> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], Result<string | null>, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.accent(path),
      queryFn:
        path === null
          ? skipToken
          : (): Promise<Result<string | null>> => this.#library.artworkAccent(path),
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  /**
   * Refetches everything the catalog serves. A list scrolled deep would refetch every loaded page,
   * one request after another, so lists start over from their first page and load the rest as
   * they are scrolled to again.
   */
  public refresh(): void {
    this.#queryClient.setQueriesData<InfiniteData<unknown, number>>(
      { queryKey: LibraryQueryKeys.catalogs },
      (data) =>
        data === undefined || data.pages.length <= 1
          ? data
          : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    );
    void this.#queryClient
      .invalidateQueries({ queryKey: LibraryQueryKeys.data })
      .catch(() => undefined);
  }

  #listPage(request: LibraryCatalogRequest, offset: number): Promise<Result<CatalogPage>> {
    const search = request.filter === "" ? null : request.filter;
    const { direction } = request;
    const limit = PAGE_SIZE;
    switch (request.presentation) {
      case "albums":
        return this.#library.listAlbums({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
      case "albumArtists":
        return this.#library.listArtists({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
      case "tracks":
        return this.#library.listTracks({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
    }
  }

  /** A letter index reads no rows, so its request asks for none. */
  #listIndex(request: LibraryCatalogRequest): Promise<Result<LetterIndexEntry[]>> {
    const search = request.filter === "" ? null : request.filter;
    const { direction } = request;
    const window = { offset: 0, limit: 0 };
    switch (request.presentation) {
      case "albums":
        return this.#library.albumIndex({ search, sort: request.sortKey, direction, ...window });
      case "albumArtists":
        return this.#library.artistIndex({ search, sort: request.sortKey, direction, ...window });
      case "tracks":
        return this.#library.trackIndex({ search, sort: request.sortKey, direction, ...window });
    }
  }
}
