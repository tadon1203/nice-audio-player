import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type AlbumId,
  type AlbumDetails,
  type LibraryAlbumPage,
  type AlbumRow,
  type LibraryAlbumTrackPage,
} from "#lib/native/bindings";
import { type LibraryClient } from "#lib/native/native-clients";
import { LibraryQueryKeys } from "./library-query-keys";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** The album detail, track, and summary queries. */
export class AlbumRepository {
  readonly #client: LibraryClient;
  readonly #queryClient: QueryClient;

  public constructor(client: LibraryClient, queryClient: QueryClient) {
    this.#client = client;
    this.#queryClient = queryClient;
  }

  public detailsOptions(albumId: AlbumId): CreateQueryOptions<
    AlbumDetails,
    Error,
    AlbumDetails,
    readonly unknown[]
  > & {
    initialData?: AlbumDetails | InitialDataFunction<AlbumDetails> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], AlbumDetails, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.album(albumId),
      queryFn: (): Promise<AlbumDetails> => this.#client.albumById(albumId),
      gcTime: Infinity,
    });
  }

  public tracksOptions(albumId: AlbumId): CreateInfiniteQueryOptions<
    LibraryAlbumTrackPage,
    Error,
    InfiniteData<LibraryAlbumTrackPage, unknown>,
    readonly unknown[],
    string | null
  > & {
    initialData?:
      | InfiniteData<LibraryAlbumTrackPage, string | null>
      | InitialDataFunction<InfiniteData<LibraryAlbumTrackPage, string | null>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<LibraryAlbumTrackPage, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.albumTracks(albumId),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }): Promise<LibraryAlbumTrackPage> =>
        this.#client.albumTracksById(albumId, pageParam),
      getNextPageParam: (page: LibraryAlbumTrackPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    });
  }

  /**
   * The album's summary from any cached list, by ID. Reads only; it never writes the cache,
   * because a partial value must not become the cached data of a query that fetches the whole
   * album.
   */
  public cachedSummary(albumId: AlbumId): AlbumRow | null {
    return this.#albumSummaries().find((summary) => summary.id === albumId) ?? null;
  }

  #albumSummaries(): AlbumRow[] {
    const albumLists = this.#queryClient.getQueriesData<InfiniteData<LibraryAlbumPage>>({
      queryKey: LibraryQueryKeys.catalogs,
    });
    const artistLists = this.#queryClient.getQueriesData<InfiniteData<LibraryAlbumPage>>({
      queryKey: LibraryQueryKeys.artistAlbumsPrefix,
    });
    const catalogAlbums = albumLists
      .filter(([queryKey]) => LibraryQueryKeys.requestOf(queryKey).presentation === "albums")
      .map(([, data]) => data);
    return [...catalogAlbums, ...artistLists.map(([, data]) => data)].flatMap(
      (data) => data?.pages.flatMap((page) => page.items) ?? [],
    );
  }
}
