import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type AlbumId,
  type AlbumDetails,
  type AlbumRow,
  type AlbumTrackRow,
} from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import { LibraryQueryKeys } from "./library-query-keys";
import type { Page } from "./catalog-repository";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** An album's tracks: the Backend answers the whole album at once, so it is one page. */
export type AlbumTracksPage = Page<AlbumTrackRow>;

/** The album detail, track, and summary queries. */
export class AlbumRepository {
  readonly #library: typeof library;
  readonly #queryClient: QueryClient;

  public constructor(libraryCommands: typeof library, queryClient: QueryClient) {
    this.#library = libraryCommands;
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
      queryFn: (): Promise<AlbumDetails> => this.#library.album(albumId),
      gcTime: Infinity,
    });
  }

  public tracksOptions(albumId: AlbumId): CreateInfiniteQueryOptions<
    AlbumTracksPage,
    Error,
    InfiniteData<AlbumTracksPage, unknown>,
    readonly unknown[],
    number
  > & {
    initialData?:
      | InfiniteData<AlbumTracksPage, number>
      | InitialDataFunction<InfiniteData<AlbumTracksPage, number>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<AlbumTracksPage, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.albumTracks(albumId),
      initialPageParam: 0,
      queryFn: async (): Promise<AlbumTracksPage> => {
        const items = await this.#library.listAlbumTracks(albumId);
        return { items, total: items.length, version: 0 };
      },
      getNextPageParam: () => undefined,
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
    const albumLists = this.#queryClient.getQueriesData<InfiniteData<Page<AlbumRow>, number>>({
      queryKey: LibraryQueryKeys.catalogs,
    });
    const artistLists = this.#queryClient.getQueriesData<InfiniteData<Page<AlbumRow>, number>>({
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
