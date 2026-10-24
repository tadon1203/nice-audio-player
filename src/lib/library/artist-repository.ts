import { infiniteQueryOptions, queryOptions } from "@tanstack/svelte-query";
import { type ArtistId, type ArtistRow, type LibraryAlbumPage } from "#lib/native/bindings";
import { type LibraryClient } from "#lib/native/native-clients";
import { LibraryQueryKeys, type ArtistAlbumsArguments } from "./library-query-keys";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InfiniteData,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** The Album Artist detail and album list queries. */
export class ArtistRepository {
  readonly #client: LibraryClient;

  public constructor(client: LibraryClient) {
    this.#client = client;
  }

  public detailsOptions(artistId: ArtistId): CreateQueryOptions<
    ArtistRow,
    Error,
    ArtistRow,
    readonly unknown[]
  > & {
    initialData?: ArtistRow | InitialDataFunction<ArtistRow> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], ArtistRow, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.artist(artistId),
      queryFn: (): Promise<ArtistRow> => this.#client.artist(artistId),
      gcTime: Infinity,
    });
  }

  public albumsOptions(request: ArtistAlbumsArguments): CreateInfiniteQueryOptions<
    LibraryAlbumPage,
    Error,
    InfiniteData<LibraryAlbumPage, unknown>,
    readonly unknown[],
    string | null
  > & {
    initialData?:
      | InfiniteData<LibraryAlbumPage, string | null>
      | InitialDataFunction<InfiniteData<LibraryAlbumPage, string | null>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<LibraryAlbumPage, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.artistAlbums(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }): Promise<LibraryAlbumPage> =>
        this.#client.artistAlbums({
          artistId: request.artistId,
          cursor: pageParam,
          sortKey: request.sortKey,
          sortDirection: request.direction,
        }),
      getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    });
  }
}
