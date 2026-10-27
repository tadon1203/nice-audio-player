import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type AlbumId,
  type AlbumDetails,
  type AlbumListItem,
  type AlbumTrackListItem,
} from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import { LibraryQueryKeys } from "./library-query-keys";
import type { Page } from "./catalog-repository";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** An album's tracks: the Backend answers the whole album at once, so it is one page. */
export type AlbumTracksPage = Page<AlbumTrackListItem>;

/** The album detail, track, and summary queries. */
export class AlbumRepository {
  readonly #library: typeof library;
  readonly #queryClient: QueryClient;

  public constructor(libraryCommands: typeof library, queryClient: QueryClient) {
    this.#library = libraryCommands;
    this.#queryClient = queryClient;
  }

  public detailsOptions(albumId: AlbumId): CreateQueryOptions<
    Result<AlbumDetails>,
    Error,
    Result<AlbumDetails>,
    readonly unknown[]
  > & {
    initialData?: Result<AlbumDetails> | InitialDataFunction<Result<AlbumDetails>> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], Result<AlbumDetails>, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.album(albumId),
      queryFn: (): Promise<Result<AlbumDetails>> => this.#library.album(albumId),
      gcTime: Infinity,
    });
  }

  public tracksOptions(albumId: AlbumId): CreateInfiniteQueryOptions<
    Result<AlbumTracksPage>,
    Error,
    InfiniteData<Result<AlbumTracksPage>, unknown>,
    readonly unknown[],
    number
  > & {
    initialData?:
      | InfiniteData<Result<AlbumTracksPage>, number>
      | InitialDataFunction<InfiniteData<Result<AlbumTracksPage>, number>>
      | undefined;
  } & QueryKeyWithDataTag<
      readonly unknown[],
      InfiniteData<Result<AlbumTracksPage>, unknown>,
      Error
    > {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.albumTracks(albumId),
      initialPageParam: 0,
      queryFn: async (): Promise<Result<AlbumTracksPage>> => {
        const outcome = await this.#library.listAlbumTracks(albumId);
        if (!outcome.ok) return outcome;
        const items = outcome.value;
        return { ok: true, value: { items, total: items.length, version: 0 } };
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
  public cachedSummary(albumId: AlbumId): AlbumListItem | null {
    return this.#albumSummaries().find((summary) => summary.id === albumId) ?? null;
  }

  #albumSummaries(): AlbumListItem[] {
    const albumLists = this.#queryClient.getQueriesData<
      InfiniteData<Result<Page<AlbumListItem>>, number>
    >({ queryKey: LibraryQueryKeys.catalogs });
    const artistLists = this.#queryClient.getQueriesData<
      InfiniteData<Result<Page<AlbumListItem>>, number>
    >({ queryKey: LibraryQueryKeys.artistAlbumsPrefix });
    const catalogAlbums = albumLists
      .filter(([queryKey]) => LibraryQueryKeys.requestOf(queryKey).presentation === "albums")
      .map(([, data]) => data);
    return [...catalogAlbums, ...artistLists.map(([, data]) => data)].flatMap(
      (data) => data?.pages.flatMap((outcome) => (outcome.ok ? outcome.value.items : [])) ?? [],
    );
  }
}
