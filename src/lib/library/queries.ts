import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistPage,
  LibraryAlbumArtistSortKey,
  LibraryAlbumKey,
  LibraryAlbumPage,
  LibraryAlbumSortKey,
  LibraryAlbumSummary,
  LibraryIndexBucket,
  LibraryAlbumTrackPage,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackPage,
  LibraryTrackSortKey,
  LibraryTrackSummary,
  LibraryAlbumArtistSummary,
} from "$lib/native";

/** The request a catalog query key was built from. */
export const requestOfCatalogKey = (key: readonly unknown[]) => key[2] as LibraryCatalogRequest;

type CatalogPage = LibraryAlbumPage | LibraryAlbumArtistPage | LibraryTrackPage;

export type Page<Item> = {
  readonly items: readonly Item[];
  /** How long the whole list is; only its first page says. */
  readonly totalCount: number | null;
  readonly nextCursor: string | null;
};

/** The catalog item type for a presentation. */
export type LibraryCatalogItem<Presentation extends LibraryCatalogRequest["presentation"]> = {
  albums: LibraryAlbumSummary;
  albumArtists: LibraryAlbumArtistSummary;
  tracks: LibraryTrackSummary;
}[Presentation];

export type LibraryCatalogRequest =
  | {
      readonly presentation: "albums";
      readonly filter: string;
      readonly sortKey: LibraryAlbumSortKey;
      readonly direction: LibrarySortDirection;
      readonly skip: number;
    }
  | {
      readonly presentation: "albumArtists";
      readonly filter: string;
      readonly sortKey: LibraryAlbumArtistSortKey;
      readonly direction: LibrarySortDirection;
      readonly skip: number;
    }
  | {
      readonly presentation: "tracks";
      readonly filter: string;
      readonly sortKey: LibraryTrackSortKey;
      readonly direction: LibrarySortDirection;
      /** Rows to start after, for a list entered at a letter of its scroll index. */
      readonly skip: number;
    };

const data = ["library", "data"] as const;

/** Everything under `data` is invalidated together when the catalog may have changed. */
export const libraryQueryKeys = {
  data,
  status: ["library", "status"] as const,
  scan: ["library", "scan"] as const,
  roots: [...data, "roots"] as const,
  /** Carries the request itself, so what the data was fetched for can be read back from the key. */
  presentation: (request: LibraryCatalogRequest) => [...data, "catalog", request] as const,
  /** The scroll index of a list: how its names are filed, in its order. Not tied to `skip`. */
  index: (request: LibraryCatalogRequest) =>
    [...data, "catalogIndex", { ...request, skip: 0 }] as const,
  album: (key: LibraryAlbumKey) =>
    [...data, "album", "detail", key.title, key.albumArtist] as const,
  albumTracks: (key: LibraryAlbumKey) =>
    [...data, "album", "tracks", key.title, key.albumArtist] as const,
  artist: (key: LibraryAlbumArtistKey) => [...data, "artist", "detail", key.name] as const,
  artistAlbums: (
    key: LibraryAlbumArtistKey,
    sortKey: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
  ) => [...data, "artist", "albums", key.name, sortKey, direction] as const,
  trackProperties: (trackId: string | null) => [...data, "track", "properties", trackId] as const,
  /** Content-addressed, so it is never invalidated with the catalog. */
  accent: (contentHash: string | null) => ["library", "accent", contentHash] as const,
};

export const libraryQueryOptions = {
  status: () =>
    queryOptions({
      queryKey: libraryQueryKeys.status,
      queryFn: () => requireNative().getLibraryStatus(),
    }),
  scan: () =>
    queryOptions({
      queryKey: libraryQueryKeys.scan,
      queryFn: () => requireNative().getLibraryScanState(),
    }),
  roots: () =>
    queryOptions({
      queryKey: libraryQueryKeys.roots,
      queryFn: () => requireNative().listLibraryRoots(),
    }),
  catalog: (request: LibraryCatalogRequest, enabled: boolean) =>
    infiniteQueryOptions({
      queryKey: libraryQueryKeys.presentation(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => listCatalogPage(request, pageParam),
      getNextPageParam: (page: CatalogPage) => page.nextCursor ?? undefined,
      enabled,
    }),
  catalogIndex: (request: LibraryCatalogRequest, enabled: boolean) =>
    queryOptions({
      queryKey: libraryQueryKeys.index(request),
      queryFn: () => listCatalogIndex(request),
      enabled,
    }),
  trackProperties: (trackId: string | null) =>
    queryOptions({
      queryKey: libraryQueryKeys.trackProperties(trackId),
      queryFn:
        trackId === null ? skipToken : () => requireNative().getLibraryTrackProperties(trackId),
    }),
  album: (key: LibraryAlbumKey) =>
    queryOptions({
      queryKey: libraryQueryKeys.album(key),
      queryFn: () => requireNative().getLibraryAlbumDetails(key),
      gcTime: Infinity,
    }),
  albumTracks: (key: LibraryAlbumKey) =>
    infiniteQueryOptions({
      queryKey: libraryQueryKeys.albumTracks(key),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => requireNative().listLibraryAlbumTracks(key, pageParam),
      getNextPageParam: (page: LibraryAlbumTrackPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    }),
  artist: (key: LibraryAlbumArtistKey) =>
    queryOptions({
      queryKey: libraryQueryKeys.artist(key),
      queryFn: () => requireNative().getLibraryAlbumArtist(key),
      gcTime: Infinity,
    }),
  artistAlbums: (
    key: LibraryAlbumArtistKey,
    sortKey: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
  ) =>
    infiniteQueryOptions({
      queryKey: libraryQueryKeys.artistAlbums(key, sortKey, direction),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        requireNative().listLibraryArtistAlbums(key, pageParam, sortKey, direction),
      getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    }),
  /** Representative artwork color as `#rrggbb`, for backgrounds only. */
  accent: (contentHash: string | null) =>
    queryOptions({
      queryKey: libraryQueryKeys.accent(contentHash),
      queryFn:
        contentHash === null ? skipToken : () => requireNative().getArtworkAccent(contentHash),
      staleTime: Infinity,
      gcTime: Infinity,
    }),
};

/** The loaded pages of an infinite query as one list. */
export function flattenPages<Item>(
  data: { readonly pages: readonly Page<Item>[] } | undefined,
): Item[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function listCatalogPage(
  request: LibraryCatalogRequest,
  cursor: string | null,
): Promise<CatalogPage> {
  const api = requireNative();
  const search = request.filter === "" ? null : request.filter;
  switch (request.presentation) {
    case "albums":
      return api.listLibraryAlbums(
        cursor,
        search,
        request.sortKey,
        request.direction,
        request.skip,
      );
    case "albumArtists":
      return api.listLibraryAlbumArtists(
        cursor,
        search,
        request.sortKey,
        request.direction,
        request.skip,
      );
    case "tracks":
      return api.listLibraryTracks(
        cursor,
        search,
        request.sortKey,
        request.direction,
        request.skip,
      );
  }
}

function listCatalogIndex(request: LibraryCatalogRequest): Promise<LibraryIndexBucket[]> {
  const api = requireNative();
  const search = request.filter === "" ? null : request.filter;
  switch (request.presentation) {
    case "albums":
      return api.listLibraryAlbumIndex(search, request.sortKey, request.direction);
    case "albumArtists":
      return api.listLibraryAlbumArtistIndex(search, request.sortKey, request.direction);
    case "tracks":
      return api.listLibraryTrackIndex(search, request.sortKey, request.direction);
  }
}
