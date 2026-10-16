import { infiniteQueryOptions, queryOptions } from "@tanstack/svelte-query";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumPage,
  LibraryClient,
} from "#lib/native";
import { LibraryQueryKeys, type ArtistAlbumsArguments } from "./library-query-keys";

/** The Album Artist detail and album list queries. */
export class ArtistRepository {
  readonly #client: LibraryClient;

  public constructor(client: LibraryClient) {
    this.#client = client;
  }

  public detailsOptions(key: LibraryAlbumArtistKey) {
    return queryOptions({
      queryKey: LibraryQueryKeys.albumArtist(key),
      queryFn: (): Promise<LibraryAlbumArtistSummary> => this.#client.albumArtist(key),
      gcTime: Infinity,
    });
  }

  public albumsOptions(request: ArtistAlbumsArguments) {
    return infiniteQueryOptions({
      queryKey: LibraryQueryKeys.artistAlbums(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }): Promise<LibraryAlbumPage> =>
        this.#client.artistAlbums(request.key, pageParam, request.sortKey, request.direction),
      getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    });
  }
}
