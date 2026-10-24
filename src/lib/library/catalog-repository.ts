import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type ArtworkHash,
  type LibraryAlbumArtistPage,
  type LibraryAlbumPage,
  type ArtistSortKey,
  type ArtistRow,
  type AlbumSortKey,
  type AlbumRow,
  type ScrollIndexBucket,
  type SortDirection,
  type LibraryTrackPage,
  type TrackSortKey,
  type TrackRow,
  type TrackId,
} from "#lib/native/bindings";
import { type LibraryClient } from "#lib/native/native-clients";
import { LibraryQueryKeys } from "./library-query-keys";
import { type TrackProperties } from "#lib/native/bindings";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";
import { type LibraryDirectory, type LibraryStatus } from "#lib/native/bindings";

export type CatalogPage = LibraryAlbumPage | LibraryAlbumArtistPage | LibraryTrackPage;

export interface Page<Item> {
  readonly items: readonly Item[];
  /** How long the whole list is; only its first page says. */
  readonly totalCount: number | null;
  readonly nextCursor: string | null;
}

/** The catalog item type for a presentation. */
export type LibraryCatalogItem<Presentation extends LibraryCatalogRequest["presentation"]> = {
  albums: AlbumRow;
  albumArtists: ArtistRow;
  tracks: TrackRow;
}[Presentation];

export type LibraryCatalogRequest =
  | {
      readonly presentation: "albums";
      readonly filter: string;
      readonly sortKey: AlbumSortKey;
      readonly direction: SortDirection;
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
      /** Rows to start after, for a list entered at a letter of its scroll index. */
      readonly skip: number;
    };

/** The catalog lists and their scroll indexes: the data the Library browses. */
export class CatalogRepository {
  readonly #client: LibraryClient;
  readonly #queryClient: QueryClient;

  public constructor(client: LibraryClient, queryClient: QueryClient) {
    this.#client = client;
    this.#queryClient = queryClient;
  }

  public statusOptions(): CreateQueryOptions<
    LibraryStatus,
    Error,
    LibraryStatus,
    readonly ["library", "status"]
  > & {
    initialData?: LibraryStatus | InitialDataFunction<LibraryStatus> | undefined;
  } & QueryKeyWithDataTag<readonly ["library", "status"], LibraryStatus, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.status,
      queryFn: () => this.#client.status(),
    });
  }

  public directoriesOptions(): CreateQueryOptions<
    LibraryDirectory[],
    Error,
    LibraryDirectory[],
    readonly ["library", "data", "directories"]
  > & {
    initialData?: LibraryDirectory[] | InitialDataFunction<LibraryDirectory[]> | undefined;
  } & QueryKeyWithDataTag<readonly ["library", "data", "directories"], LibraryDirectory[], Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.directories,
      queryFn: () => this.#client.directories(),
    });
  }

  public pageOptions(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): CreateInfiniteQueryOptions<
    CatalogPage,
    Error,
    InfiniteData<CatalogPage, unknown>,
    readonly unknown[],
    string | null
  > & {
    initialData?:
      | InfiniteData<CatalogPage, string | null>
      | InitialDataFunction<InfiniteData<CatalogPage, string | null>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<CatalogPage, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.catalog(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => this.#listPage(request, pageParam),
      getNextPageParam: (page: CatalogPage) => page.nextCursor ?? undefined,
      enabled,
    });
  }

  public indexOptions(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): CreateQueryOptions<ScrollIndexBucket[], Error, ScrollIndexBucket[], readonly unknown[]> & {
    initialData?: ScrollIndexBucket[] | InitialDataFunction<ScrollIndexBucket[]> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], ScrollIndexBucket[], Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.catalogIndex(request),
      queryFn: () => this.#listIndex(request),
      enabled,
    });
  }

  public trackPropertiesOptions(trackId: TrackId | null): CreateQueryOptions<
    TrackProperties,
    Error,
    TrackProperties,
    readonly unknown[]
  > & {
    initialData?: TrackProperties | InitialDataFunction<TrackProperties> | null | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], TrackProperties, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.trackProperties(trackId),
      queryFn:
        trackId === null
          ? skipToken
          : (): Promise<TrackProperties> => this.#client.trackProperties(trackId),
    });
  }

  /** Representative artwork color as `#rrggbb`, for backgrounds only. */
  public accentOptions(hash: ArtworkHash | null): CreateQueryOptions<
    string | null,
    Error,
    string | null,
    readonly unknown[]
  > & {
    initialData?: string | InitialDataFunction<string | null> | null | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], string | null, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.accent(hash),
      queryFn:
        hash === null ? skipToken : (): Promise<string | null> => this.#client.artworkAccent(hash),
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  /**
   * Refetches everything the catalog serves. A list scrolled deep would refetch every loaded page,
   * one request after another (each needs the cursor of the one before), so lists start over from
   * their first page and load the rest as they are scrolled to again.
   */
  public refresh(): void {
    this.#queryClient.setQueriesData<InfiniteData<unknown>>(
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

  #listPage(request: LibraryCatalogRequest, cursor: string | null): Promise<CatalogPage> {
    const search = request.filter === "" ? null : request.filter;
    const { direction: sortDirection, skip } = request;
    switch (request.presentation) {
      case "albums":
        return this.#client.albums({
          search,
          sortKey: request.sortKey,
          sortDirection,
          cursor,
          skip,
        });
      case "albumArtists":
        return this.#client.albumArtists({
          search,
          sortKey: request.sortKey,
          sortDirection,
          cursor,
          skip,
        });
      case "tracks":
        return this.#client.tracks({
          search,
          sortKey: request.sortKey,
          sortDirection,
          cursor,
          skip,
        });
    }
  }

  #listIndex(request: LibraryCatalogRequest): Promise<ScrollIndexBucket[]> {
    const search = request.filter === "" ? null : request.filter;
    const sortDirection = request.direction;
    switch (request.presentation) {
      case "albums":
        return this.#client.albumIndex({ search, sortKey: request.sortKey, sortDirection });
      case "albumArtists":
        return this.#client.albumArtistIndex({ search, sortKey: request.sortKey, sortDirection });
      case "tracks":
        return this.#client.trackIndex({ search, sortKey: request.sortKey, sortDirection });
    }
  }
}
