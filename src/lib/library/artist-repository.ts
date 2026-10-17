import { infiniteQueryOptions, queryOptions } from "@tanstack/svelte-query";
import type {
  ArtistId,
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumPage,
  LibraryClient,
} from "#lib/native";
import {
  LibraryQueryKeys,
  type AlbumArtistAlbumsArguments,
  type ArtistAlbumsArguments,
} from "./library-query-keys";

/** The Album Artist detail and album list queries. */
export class ArtistRepository {
  readonly #client: LibraryClient;

  public constructor(client: LibraryClient) {
    this.#client = client;
  }

  public detailsOptions(artistId: ArtistId) {
    return queryOptions({
      queryKey: LibraryQueryKeys.artist(artistId),
      queryFn: (): Promise<LibraryAlbumArtistSummary> => this.#client.artist(artistId),
      gcTime: Infinity,
    });
  }

  public albumsOptions(request: ArtistAlbumsArguments) {
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

  /** The old name route's detail, until that route is removed. */
  public albumArtistDetailsOptions(key: LibraryAlbumArtistKey) {
    return queryOptions({
      queryKey: LibraryQueryKeys.albumArtist(key),
      queryFn: (): Promise<LibraryAlbumArtistSummary> => this.#client.albumArtist(key),
      gcTime: Infinity,
    });
  }

  /** The old name route's album list, until that route is removed. */
  public albumArtistAlbumsOptions(request: AlbumArtistAlbumsArguments) {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.albumArtistAlbums(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }): Promise<LibraryAlbumPage> =>
        this.#client.albumArtistAlbums(request.key, pageParam, request.sortKey, request.direction),
      getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    });
  }
}
