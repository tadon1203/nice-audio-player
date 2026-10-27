import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/svelte-query";
import {
  type AlbumDetails,
  type AlbumId,
  type AlbumListItem,
  type AlbumTrackListItem,
  type ArtistAlbumSortKey,
  type ArtistId,
  type ArtistListItem,
  type LetterIndexEntry,
  type LibraryState,
  type SortDirection,
  type TrackId,
  type TrackProperties,
} from "#lib/native/bindings";
import type { library } from "#lib/native/commands";
import { selectDirectory } from "#lib/native/desktop";
import type { Result } from "#lib/native/result";
import type { ResultPagesOptions, ResultQueryOptions } from "#lib/native/query-types";
import { LibraryCatalog } from "./library-catalog.svelte";
import {
  ARTIST_ALBUMS_KEY,
  CATALOG_KEY,
  LIBRARY_KEY,
  accentKey,
  albumKey,
  albumTracksKey,
  artistAlbumsKey,
  artistKey,
  catalogIndexKey,
  catalogKey,
  catalogRequestOf,
  trackPropertiesKey,
} from "./library-keys";
import { LibraryView } from "./library-view.svelte";
import { Sort } from "./sort";
import type { ArtistAlbumsRequest, CatalogPage, LibraryCatalogRequest, Page } from "./types";

/** How many rows one page asks for. */
const PAGE_SIZE = 100;

/** An artist's albums have a sort but no filter. */
class ArtistAlbumsView {
  public sortKey: ArtistAlbumSortKey = $state.raw("year");
  public direction: SortDirection = $state("ascending");
  public readonly sortOptions = Sort.artistAlbumOptions;

  /** Identifies the sort alone, so a list can tell when its order changed. */
  public get sortSignature(): string {
    return `${this.sortKey}:${this.direction}`;
  }

  public get stateKey(): string {
    return `${this.sortKey}\u0000${this.direction}`;
  }

  public setSort = (key: ArtistAlbumSortKey, direction: SortDirection = "ascending"): void => {
    this.sortKey = key;
    this.direction = direction;
  };

  public toggleDirection = (): void => {
    this.direction = Sort.toggleDirection(this.direction);
  };
}

/**
 * The Library: the indexed set of tracks. It holds the Library state that the Backend pushes, the
 * query options that read the Library, the commands that change it, and the filter and sort of each
 * view. A component reads its queries with `createQuery` and runs its commands directly.
 */
export class Library {
  readonly #commands: typeof library;
  readonly #queryClient: QueryClient;
  #state = $state.raw<LibraryState | null>(null);
  #libraryVersion = 0;

  /** The filter and sort of each view. They stay for the life of the window. */
  public readonly albums = new LibraryView("albums", "title", Sort.albumOptions);
  public readonly albumArtists = new LibraryView("albumArtists", "artist", Sort.albumArtistOptions);
  public readonly tracks = new LibraryView("tracks", "title", Sort.trackOptions);
  public readonly artistAlbums = new ArtistAlbumsView();

  public constructor(commands: typeof library, queryClient: QueryClient) {
    this.#commands = commands;
    this.#queryClient = queryClient;
  }

  /** The Library state as the Backend last pushed it; `null` until the first push arrives. */
  public get state(): LibraryState | null {
    return this.#state;
  }

  /**
   * Takes a pushed Library state. When the Library version moved, the lists may have changed, so
   * they refresh. Returns true when the version moved, so the caller can refresh what else reads
   * the Library.
   */
  public accept(state: LibraryState): boolean {
    this.#state = state;
    if (state.version === this.#libraryVersion) return false;
    this.#libraryVersion = state.version;
    this.refresh();
    return true;
  }

  /**
   * Refetches everything the Library serves. A list scrolled deep would refetch every loaded page,
   * one request after another, so lists start over from their first page and load the rest as
   * they are scrolled to again.
   */
  public refresh(): void {
    this.#queryClient.setQueriesData<InfiniteData<unknown, number>>(
      { queryKey: CATALOG_KEY },
      (data) =>
        data === undefined || data.pages.length <= 1
          ? data
          : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    );
    void this.#queryClient.invalidateQueries({ queryKey: LIBRARY_KEY }).catch(() => undefined);
  }

  /** The catalog list that a component browses. `request` is read again when its inputs change. */
  public catalog<TRequest extends LibraryCatalogRequest>(
    request: () => TRequest,
  ): LibraryCatalog<TRequest> {
    return new LibraryCatalog(this, request);
  }

  /**
   * The pages of a catalog list, by offset. The first page starts at `request.skip`; each next one
   * starts after the rows loaded so far. A page read at another Library version than the first
   * one's means the list changed under it, so the list starts over from its first page.
   */
  public getCatalogPages(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): ResultPagesOptions<CatalogPage> {
    return infiniteQueryOptions({
      queryKey: catalogKey(request),
      initialPageParam: request.skip,
      queryFn: async ({ pageParam, queryKey }) => {
        const outcome = await this.#listPage(request, pageParam);
        const first =
          this.#queryClient.getQueryData<InfiniteData<Result<CatalogPage>, number>>(queryKey)
            ?.pages[0];
        // A page read at another Library version means the list changed under the pages before it.
        if (
          outcome.ok &&
          pageParam !== request.skip &&
          first?.ok &&
          first.value.version !== outcome.value.version
        ) {
          void this.#queryClient.resetQueries({ queryKey, exact: true }).catch(() => undefined);
        }
        return outcome;
      },
      // A failed page has no next page to ask for: the list stops at it and shows its error.
      getNextPageParam: (last: Result<CatalogPage>, _pages, lastPageParam: number) => {
        if (!last.ok) return undefined;
        const next = lastPageParam + last.value.items.length;
        return next < last.value.total ? next : undefined;
      },
      enabled,
    });
  }

  public getCatalogIndex(
    request: LibraryCatalogRequest,
    enabled: boolean,
  ): ResultQueryOptions<LetterIndexEntry[]> {
    return queryOptions({
      queryKey: catalogIndexKey(request),
      queryFn: (): Promise<Result<LetterIndexEntry[]>> => this.#listIndex(request),
      enabled,
    });
  }

  public getTrackProperties(trackId: TrackId | null): ResultQueryOptions<TrackProperties> {
    return queryOptions({
      queryKey: trackPropertiesKey(trackId),
      queryFn:
        trackId === null
          ? skipToken
          : (): Promise<Result<TrackProperties>> => this.#commands.trackProperties(trackId),
    });
  }

  /** Representative artwork color as `#rrggbb`, for backgrounds only. */
  public getAccent(path: string | null): ResultQueryOptions<string | null> {
    return queryOptions({
      // Content-addressed, so it is not under the Library key and a refresh never refetches it.
      queryKey: accentKey(path),
      queryFn:
        path === null
          ? skipToken
          : (): Promise<Result<string | null>> => this.#commands.artworkAccent(path),
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  public getAlbum(albumId: AlbumId): ResultQueryOptions<AlbumDetails> {
    return queryOptions({
      queryKey: albumKey(albumId),
      queryFn: (): Promise<Result<AlbumDetails>> => this.#commands.album(albumId),
      gcTime: Infinity,
    });
  }

  /** An album's tracks: the Backend answers the whole album at once, so it is one page. */
  public getAlbumTracks(albumId: AlbumId): ResultPagesOptions<Page<AlbumTrackListItem>> {
    return infiniteQueryOptions({
      queryKey: albumTracksKey(albumId),
      initialPageParam: 0,
      queryFn: async (): Promise<Result<Page<AlbumTrackListItem>>> => {
        const outcome = await this.#commands.listAlbumTracks(albumId);
        if (!outcome.ok) return outcome;
        const items = outcome.value;
        return { ok: true, value: { items, total: items.length, version: 0 } };
      },
      getNextPageParam: () => undefined,
      gcTime: Infinity,
    });
  }

  public getArtist(artistId: ArtistId): ResultQueryOptions<ArtistListItem> {
    return queryOptions({
      queryKey: artistKey(artistId),
      queryFn: (): Promise<Result<ArtistListItem>> => this.#commands.artist(artistId),
      gcTime: Infinity,
    });
  }

  public getArtistAlbums(request: ArtistAlbumsRequest): ResultPagesOptions<Page<AlbumListItem>> {
    return infiniteQueryOptions({
      queryKey: artistAlbumsKey(request),
      initialPageParam: 0,
      queryFn: ({ pageParam }): Promise<Result<Page<AlbumListItem>>> =>
        this.#commands.listArtistAlbums(request.artistId, {
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

  /**
   * An album's summary from any cached list, by ID. Reads only; it never writes the cache, because
   * a partial value must not become the cached data of a query that fetches the whole album.
   */
  public getCachedAlbum(albumId: AlbumId): AlbumListItem | null {
    return this.#albumSummaries().find((summary) => summary.id === albumId) ?? null;
  }

  /** Opens the directory dialog and adds the chosen directory. Does nothing when the user closes it. */
  public async addDirectory(): Promise<Result<null> | void> {
    const path = await selectDirectory();
    if (path === null) return;
    return this.#commands.addDirectory(path);
  }

  public setDirectoryEnabled(id: number, enabled: boolean): Promise<Result<null>> {
    return this.#commands.setDirectoryEnabled(id, enabled);
  }

  public removeDirectory(id: number): Promise<Result<null>> {
    return this.#commands.removeDirectory(id);
  }

  /** Removes the Missing tracks from the Library (never a source file). */
  public deleteMissingTracks(): Promise<Result<null>> {
    return this.#commands.deleteMissingTracks();
  }

  public startScan(): Promise<Result<null>> {
    return this.#commands.startScan();
  }

  public cancelScan(): Promise<Result<null>> {
    return this.#commands.cancelScan();
  }

  /** The Backend restarts the app on success. */
  public resetAndRescan(): Promise<Result<null>> {
    return this.#commands.reset();
  }

  public reveal(trackId: TrackId): Promise<Result<null>> {
    return this.#commands.revealTrack(trackId);
  }

  #listPage(request: LibraryCatalogRequest, offset: number): Promise<Result<CatalogPage>> {
    const search = request.filter === "" ? null : request.filter;
    const { direction } = request;
    const limit = PAGE_SIZE;
    switch (request.presentation) {
      case "albums":
        return this.#commands.listAlbums({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
      case "albumArtists":
        return this.#commands.listArtists({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
      case "tracks":
        return this.#commands.listTracks({
          search,
          sort: request.sortKey,
          direction,
          offset,
          limit,
        });
    }
  }

  /** A letter index reads no rows, so its request asks for none. */
  #listIndex(request: LibraryCatalogRequest): Promise<Result<LetterIndexEntry[]>> {
    const search = request.filter === "" ? null : request.filter;
    const { direction } = request;
    const window = { offset: 0, limit: 0 };
    switch (request.presentation) {
      case "albums":
        return this.#commands.albumIndex({ search, sort: request.sortKey, direction, ...window });
      case "albumArtists":
        return this.#commands.artistIndex({ search, sort: request.sortKey, direction, ...window });
      case "tracks":
        return this.#commands.trackIndex({ search, sort: request.sortKey, direction, ...window });
    }
  }

  /** The album summaries of every cached album list, read from the cache only. */
  #albumSummaries(): AlbumListItem[] {
    const catalogLists = this.#queryClient.getQueriesData<
      InfiniteData<Result<Page<AlbumListItem>>, number>
    >({ queryKey: CATALOG_KEY });
    const artistLists = this.#queryClient.getQueriesData<
      InfiniteData<Result<Page<AlbumListItem>>, number>
    >({ queryKey: ARTIST_ALBUMS_KEY });
    const catalogAlbums = catalogLists
      .filter(([queryKey]) => catalogRequestOf(queryKey).presentation === "albums")
      .map(([, data]) => data);
    return [...catalogAlbums, ...artistLists.map(([, data]) => data)].flatMap(
      (data) => data?.pages.flatMap((outcome) => (outcome.ok ? outcome.value.items : [])) ?? [],
    );
  }
}
