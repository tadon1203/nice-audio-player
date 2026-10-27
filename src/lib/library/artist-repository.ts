import { infiniteQueryOptions, queryOptions } from "@tanstack/svelte-query";
import { type AlbumListItem, type ArtistId, type ArtistListItem } from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
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
    Result<ArtistListItem>,
    Error,
    Result<ArtistListItem>,
    readonly unknown[]
  > & {
    initialData?: Result<ArtistListItem> | InitialDataFunction<Result<ArtistListItem>> | undefined;
  } & QueryKeyWithDataTag<readonly unknown[], Result<ArtistListItem>, Error> {
    return queryOptions({
      queryKey: LibraryQueryKeys.artist(artistId),
      queryFn: (): Promise<Result<ArtistListItem>> => this.#library.artist(artistId),
      gcTime: Infinity,
    });
  }

  public albumsOptions(request: ArtistAlbumsArguments): CreateInfiniteQueryOptions<
    Result<Page<AlbumListItem>>,
    Error,
    InfiniteData<Result<Page<AlbumListItem>>, unknown>,
    readonly unknown[],
    number
  > & {
    initialData?:
      | InfiniteData<Result<Page<AlbumListItem>>, number>
      | InitialDataFunction<InfiniteData<Result<Page<AlbumListItem>>, number>>
      | undefined;
  } & QueryKeyWithDataTag<
      readonly unknown[],
      InfiniteData<Result<Page<AlbumListItem>>, unknown>,
      Error
    > {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.artistAlbums(request),
      initialPageParam: 0,
      queryFn: ({ pageParam }): Promise<Result<Page<AlbumListItem>>> =>
        this.#library.listArtistAlbums(request.artistId, {
          search: null,
          sort: request.sortKey,
          direction: request.direction,
          offset: pageParam,
          limit: PAGE_SIZE,
        }),
      // A failed page has no next page to ask for: the list stops at it and shows its error.
      getNextPageParam: (last: Result<Page<AlbumListItem>>, _pages, lastPageParam: number) => {
        if (!last.ok) return undefined;
        const next = lastPageParam + last.value.items.length;
        return next < last.value.total ? next : undefined;
      },
      gcTime: Infinity,
    });
  }
}
