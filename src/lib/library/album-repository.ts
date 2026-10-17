import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import type {
  AlbumId,
  LibraryAlbumDetails,
  LibraryAlbumPage,
  LibraryAlbumSummary,
  LibraryAlbumTrackPage,
  LibraryClient,
} from "#lib/native";
import { LibraryQueryKeys } from "./library-query-keys";

/** The album detail, track, and summary queries. */
export class AlbumRepository {
  readonly #client: LibraryClient;
  readonly #queryClient: QueryClient;

  public constructor(client: LibraryClient, queryClient: QueryClient) {
    this.#client = client;
    this.#queryClient = queryClient;
  }

  public detailsOptions(albumId: AlbumId) {
    return queryOptions({
      queryKey: LibraryQueryKeys.album(albumId),
      queryFn: (): Promise<LibraryAlbumDetails> => this.#client.albumById(albumId),
      gcTime: Infinity,
    });
  }

  public tracksOptions(albumId: AlbumId) {
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
  public cachedSummary(albumId: AlbumId): LibraryAlbumSummary | null {
    return this.#albumSummaries().find((summary) => summary.id === albumId) ?? null;
  }

  #albumSummaries(): LibraryAlbumSummary[] {
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
