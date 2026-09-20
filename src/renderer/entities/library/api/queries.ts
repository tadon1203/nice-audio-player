import { useMemo } from "react";
import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { electronApi } from "@/renderer/shared/lib/electron";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistPage,
  LibraryAlbumArtistSortKey,
  LibraryAlbumKey,
  LibraryAlbumPage,
  LibraryAlbumSortKey,
  LibraryAlbumTrackPage,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackPage,
  LibraryTrackSortKey,
} from "@/shared/ipc";

type CatalogPage = LibraryAlbumPage | LibraryAlbumArtistPage | LibraryTrackPage;
type CatalogItem = CatalogPage["items"][number];

export type LibraryCatalogRequest =
  | {
      readonly presentation: "albums";
      readonly filter: string;
      readonly sortKey: LibraryAlbumSortKey;
      readonly direction: LibrarySortDirection;
    }
  | {
      readonly presentation: "albumArtists";
      readonly filter: string;
      readonly sortKey: LibraryAlbumArtistSortKey;
      readonly direction: LibrarySortDirection;
    }
  | {
      readonly presentation: "tracks";
      readonly filter: string;
      readonly sortKey: LibraryTrackSortKey;
      readonly direction: LibrarySortDirection;
    };

export const libraryQueryKeys = {
  root: ["library"] as const,
  data: ["library", "data"] as const,
  status: ["library", "status"] as const,
  scan: ["library", "scan"] as const,
  roots: ["library", "data", "roots"] as const,
  catalog: ["library", "data", "catalog"] as const,
  presentation: (request: LibraryCatalogRequest) =>
    [
      "library",
      "data",
      "catalog",
      request.presentation,
      request.filter,
      request.sortKey,
      request.direction,
    ] as const,
  album: (key: LibraryAlbumKey) =>
    ["library", "data", "album", "detail", key.title, key.albumArtist] as const,
  albumTracks: (key: LibraryAlbumKey) =>
    ["library", "data", "album", "tracks", key.title, key.albumArtist] as const,
  artist: (key: LibraryAlbumArtistKey) =>
    ["library", "data", "artist", "detail", key.name] as const,
  artistAlbums: (
    key: LibraryAlbumArtistKey,
    sortKey: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
  ) => ["library", "data", "artist", "albums", key.name, sortKey, direction] as const,
  track: (path: string) => ["library", "data", "track", path] as const,
};

export const libraryQueryOptions = {
  status: () =>
    queryOptions({
      queryKey: libraryQueryKeys.status,
      queryFn: () => electronApi().getLibraryStatus(),
    }),
  scan: () =>
    queryOptions({
      queryKey: libraryQueryKeys.scan,
      queryFn: () => electronApi().getLibraryScanState(),
    }),
  roots: () =>
    queryOptions({
      queryKey: libraryQueryKeys.roots,
      queryFn: () => electronApi().listLibraryRoots(),
    }),
  catalog: (request: LibraryCatalogRequest, enabled: boolean) =>
    infiniteQueryOptions({
      queryKey: libraryQueryKeys.presentation(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => listCatalogPage(request, pageParam),
      getNextPageParam: (page: CatalogPage) => page.nextCursor ?? undefined,
      enabled,
    }),
  track: (path: string | null) =>
    queryOptions({
      queryKey: path ? libraryQueryKeys.track(path) : (["library", "data", "track", "inactive"] as const),
      queryFn: () => (path ? electronApi().getLibraryTrackForPath(path) : Promise.resolve(null)),
      enabled: path !== null,
    }),
};

export function useLibraryStatus() {
  return useQuery(libraryQueryOptions.status());
}

export function useLibraryScan() {
  return useQuery(libraryQueryOptions.scan());
}

export function useLibraryRootsQuery() {
  return useQuery(libraryQueryOptions.roots());
}

export function useLibraryPresentationQuery(request: LibraryCatalogRequest, enabled = true) {
  const query = useInfiniteQuery(libraryQueryOptions.catalog(request, enabled));
  const items = useMemo<CatalogItem[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

export function useAlbumDetails(key: LibraryAlbumKey | null) {
  return useQuery({
    queryKey: key
      ? libraryQueryKeys.album(key)
      : (["library", "data", "album", "detail", "inactive"] as const),
    queryFn: () => {
      if (!key) throw new Error("Album key is required");
      return electronApi().getLibraryAlbumDetails(key);
    },
    enabled: key !== null,
  });
}

export function useAlbumTracks(key: LibraryAlbumKey | null) {
  const query = useInfiniteQuery({
    queryKey: key
      ? libraryQueryKeys.albumTracks(key)
      : (["library", "data", "album", "tracks", "inactive"] as const),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!key) throw new Error("Album key is required");
      return electronApi().listLibraryAlbumTracks(key, pageParam);
    },
    getNextPageParam: (page: LibraryAlbumTrackPage) => page.nextCursor ?? undefined,
    enabled: key !== null,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    nextCursor: query.data?.pages.at(-1)?.nextCursor ?? null,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export function useAlbumArtist(key: LibraryAlbumArtistKey | null) {
  return useQuery({
    queryKey: key
      ? libraryQueryKeys.artist(key)
      : (["library", "data", "artist", "detail", "inactive"] as const),
    queryFn: () => {
      if (!key) throw new Error("Artist key is required");
      return electronApi().getLibraryAlbumArtist(key);
    },
    enabled: key !== null,
  });
}

export function useArtistAlbums(
  key: LibraryAlbumArtistKey | null,
  sortKey: LibraryArtistAlbumSortKey,
  direction: LibrarySortDirection,
) {
  const query = useInfiniteQuery({
    queryKey: key
      ? libraryQueryKeys.artistAlbums(key, sortKey, direction)
      : (["library", "data", "artist", "albums", "inactive", sortKey, direction] as const),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!key) throw new Error("Artist key is required");
      return electronApi().listLibraryArtistAlbums(key, pageParam, sortKey, direction);
    },
    getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
    enabled: key !== null,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    nextCursor: query.data?.pages.at(-1)?.nextCursor ?? null,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

export function useLibraryTrackForPath(path: string | null) {
  return useQuery(libraryQueryOptions.track(path));
}

function listCatalogPage(
  request: LibraryCatalogRequest,
  cursor: string | null,
): Promise<CatalogPage> {
  const api = electronApi();
  const search = request.filter === "" ? null : request.filter;
  switch (request.presentation) {
    case "albums":
      return api.listLibraryAlbums(cursor, search, request.sortKey, request.direction);
    case "albumArtists":
      return api.listLibraryAlbumArtists(cursor, search, request.sortKey, request.direction);
    case "tracks":
      return api.listLibraryTracks(cursor, search, request.sortKey, request.direction);
  }
}
