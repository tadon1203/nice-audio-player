import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import type {
  ArtworkHash,
  LibraryAlbumArtistPage,
  LibraryAlbumPage,
  LibraryAlbumArtistSortKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumSortKey,
  LibraryAlbumSummary,
  LibraryClient,
  LibraryIndexBucket,
  LibrarySortDirection,
  LibraryTrackPage,
  LibraryTrackSortKey,
  LibraryTrackSummary,
} from "#lib/native";
import { LibraryQueryKeys } from "./library-query-keys";

export type CatalogPage = LibraryAlbumPage | LibraryAlbumArtistPage | LibraryTrackPage;

export type Page<Item> = {
  readonly items: readonly Item[];
  /** How long the whole list is; only its first page says. */
  readonly totalCount: number | null;
  readonly nextCursor: string | null;
};

/** The catalog item type for a presentation. */
export type LibraryCatalogItem<Presentation extends LibraryCatalogRequest["presentation"]> = {
  albums: LibraryAlbumSummary;
  albumArtists: LibraryAlbumArtistSummary;
  tracks: LibraryTrackSummary;
}[Presentation];

export type LibraryCatalogRequest =
  | {
      readonly presentation: "albums";
      readonly filter: string;
      readonly sortKey: LibraryAlbumSortKey;
      readonly direction: LibrarySortDirection;
      readonly skip: number;
    }
  | {
      readonly presentation: "albumArtists";
      readonly filter: string;
      readonly sortKey: LibraryAlbumArtistSortKey;
      readonly direction: LibrarySortDirection;
      readonly skip: number;
    }
  | {
      readonly presentation: "tracks";
      readonly filter: string;
      readonly sortKey: LibraryTrackSortKey;
      readonly direction: LibrarySortDirection;
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

  public statusOptions() {
    return queryOptions({
      queryKey: LibraryQueryKeys.status,
      queryFn: () => this.#client.status(),
    });
  }

  public rootsOptions() {
    return queryOptions({
      queryKey: LibraryQueryKeys.roots,
      queryFn: () => this.#client.roots(),
    });
  }

  public pageOptions(request: LibraryCatalogRequest, enabled: boolean) {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.catalog(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => this.#listPage(request, pageParam),
      getNextPageParam: (page: CatalogPage) => page.nextCursor ?? undefined,
      enabled,
    });
  }

  public indexOptions(request: LibraryCatalogRequest, enabled: boolean) {
    return queryOptions({
      queryKey: LibraryQueryKeys.catalogIndex(request),
      queryFn: () => this.#listIndex(request),
      enabled,
    });
  }

  public trackPropertiesOptions(trackId: string | null) {
    return queryOptions({
      queryKey: LibraryQueryKeys.trackProperties(trackId),
      queryFn: trackId === null ? skipToken : () => this.#client.trackProperties(trackId),
    });
  }

  /** Representative artwork color as `#rrggbb`, for backgrounds only. */
  public accentOptions(hash: ArtworkHash | null) {
    return queryOptions({
      queryKey: LibraryQueryKeys.accent(hash),
      queryFn: hash === null ? skipToken : () => this.#client.artworkAccent(hash),
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
    void this.#queryClient.invalidateQueries({ queryKey: LibraryQueryKeys.data });
  }

  #listPage(request: LibraryCatalogRequest, cursor: string | null): Promise<CatalogPage> {
    const search = request.filter === "" ? null : request.filter;
    switch (request.presentation) {
      case "albums":
        return this.#client.albums(
          cursor,
          search,
          request.sortKey,
          request.direction,
          request.skip,
        );
      case "albumArtists":
        return this.#client.albumArtists(
          cursor,
          search,
          request.sortKey,
          request.direction,
          request.skip,
        );
      case "tracks":
        return this.#client.tracks(
          cursor,
          search,
          request.sortKey,
          request.direction,
          request.skip,
        );
    }
  }

  #listIndex(request: LibraryCatalogRequest): Promise<LibraryIndexBucket[]> {
    const search = request.filter === "" ? null : request.filter;
    switch (request.presentation) {
      case "albums":
        return this.#client.albumIndex(search, request.sortKey, request.direction);
      case "albumArtists":
        return this.#client.albumArtistIndex(search, request.sortKey, request.direction);
      case "tracks":
        return this.#client.trackIndex(search, request.sortKey, request.direction);
    }
  }
}
