import { infiniteQueryOptions, queryOptions } from "@tanstack/svelte-query";
import { type AlbumRow, type ArtistId, type ArtistRow } from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import { LibraryQueryKeys, type ArtistAlbumsArguments } from "./library-query-keys";
import { PAGE_SIZE, type Page } from "./catalog-repository";
import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InfiniteData,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** The Album Artist detail and album list queries. */
export class ArtistRepository {
  readonly #library: typeof library;

  public constructor(libraryCommands: typeof library) {
    this.#library = libraryCommands;
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
      queryFn: (): Promise<ArtistRow> => this.#library.artist(artistId),
      gcTime: Infinity,
    });
  }

  public albumsOptions(request: ArtistAlbumsArguments): CreateInfiniteQueryOptions<
    Page<AlbumRow>,
    Error,
    InfiniteData<Page<AlbumRow>, unknown>,
    readonly unknown[],
    number
  > & {
    initialData?:
      | InfiniteData<Page<AlbumRow>, number>
      | InitialDataFunction<InfiniteData<Page<AlbumRow>, number>>
      | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], InfiniteData<Page<AlbumRow>, unknown>, Error> {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.artistAlbums(request),
      initialPageParam: 0,
      queryFn: ({ pageParam }): Promise<Page<AlbumRow>> =>
        this.#library.listArtistAlbums(request.artistId, {
          search: null,
          sort: request.sortKey,
          direction: request.direction,
          offset: pageParam,
          limit: PAGE_SIZE,
        }),
      getNextPageParam: (last: Page<AlbumRow>, _pages, lastPageParam: number) => {
        const next = lastPageParam + last.items.length;
        return next < last.total ? next : undefined;
      },
      gcTime: Infinity,
    });
  }
}
