import { useMemo } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { nativeApi } from "@/renderer/shared/lib/native";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistPage,
  LibraryAlbumArtistSortKey,
  LibraryAlbumKey,
  LibraryAlbumPage,
  LibraryAlbumSortKey,
  LibraryAlbumSummary,
  LibraryAlbumTrackPage,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackPage,
  LibraryTrackSortKey,
  LibraryTrackSummary,
  LibraryAlbumArtistSummary,
} from "@/shared/ipc";

type CatalogPage = LibraryAlbumPage | LibraryAlbumArtistPage | LibraryTrackPage;

type Page<Item> = {
  readonly items: readonly Item[];
  readonly totalCount: number;
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

const data = ["library", "data"] as const;

/** Everything under `data` is invalidated together when the catalog may have changed. */
export const libraryQueryKeys = {
  data,
  status: ["library", "status"] as const,
  scan: ["library", "scan"] as const,
  roots: [...data, "roots"] as const,
  presentation: (request: LibraryCatalogRequest) =>
    [
      ...data,
      "catalog",
      request.presentation,
      request.filter,
      request.sortKey,
      request.direction,
    ] as const,
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
  track: (path: string | null) => [...data, "track", path] as const,
};

export const libraryQueryOptions = {
  status: () =>
    queryOptions({
      queryKey: libraryQueryKeys.status,
      queryFn: () => nativeApi().getLibraryStatus(),
    }),
  scan: () =>
    queryOptions({
      queryKey: libraryQueryKeys.scan,
      queryFn: () => nativeApi().getLibraryScanState(),
    }),
  roots: () =>
    queryOptions({
      queryKey: libraryQueryKeys.roots,
      queryFn: () => nativeApi().listLibraryRoots(),
    }),
  catalog: (request: LibraryCatalogRequest, enabled: boolean) =>
    infiniteQueryOptions({
      queryKey: libraryQueryKeys.presentation(request),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => listCatalogPage(request, pageParam),
      getNextPageParam: (page: CatalogPage) => page.nextCursor ?? undefined,
      enabled,
      gcTime: Infinity,
    }),
  track: (path: string | null) =>
    queryOptions({
      queryKey: libraryQueryKeys.track(path),
      queryFn: path === null ? skipToken : () => nativeApi().getLibraryTrackForPath(path),
      gcTime: Infinity,
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

/** Flattens the loaded pages of an infinite query into one list with paging state. */
function useFlattenedInfiniteQuery<TPage extends Page<unknown>>(
  query: UseInfiniteQueryResult<InfiniteData<TPage>, Error>,
) {
  const items = useMemo<TPage["items"][number][]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    nextCursor: query.data?.pages.at(-1)?.nextCursor ?? null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export type LibraryCollectionQuery<Item> = Omit<
  ReturnType<typeof useFlattenedInfiniteQuery<Page<Item>>>,
  never
>;

export function useLibraryPresentationQuery<Request extends LibraryCatalogRequest>(
  request: Request,
  enabled = true,
): LibraryCollectionQuery<LibraryCatalogItem<Request["presentation"]>> {
  const query = useInfiniteQuery({
    ...libraryQueryOptions.catalog(request, enabled),
    placeholderData: (previousData, previousQuery) => {
      const previousPresentation = previousQuery?.queryKey[3];
      return previousPresentation === request.presentation ? previousData : undefined;
    },
  });
  // The query function is chosen by `request.presentation`, so its pages hold exactly
  // that presentation's item type; TypeScript cannot correlate the two through the union.
  return useFlattenedInfiniteQuery(query) as LibraryCollectionQuery<
    LibraryCatalogItem<Request["presentation"]>
  >;
}

export function useAlbumDetails(key: LibraryAlbumKey) {
  return useQuery({
    queryKey: libraryQueryKeys.album(key),
    queryFn: () => nativeApi().getLibraryAlbumDetails(key),
    gcTime: Infinity,
  });
}

export function useAlbumTracks(key: LibraryAlbumKey) {
  return useFlattenedInfiniteQuery(
    useInfiniteQuery({
      queryKey: libraryQueryKeys.albumTracks(key),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => nativeApi().listLibraryAlbumTracks(key, pageParam),
      getNextPageParam: (page: LibraryAlbumTrackPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    }),
  );
}

export function useAlbumArtist(key: LibraryAlbumArtistKey) {
  return useQuery({
    queryKey: libraryQueryKeys.artist(key),
    queryFn: () => nativeApi().getLibraryAlbumArtist(key),
    gcTime: Infinity,
  });
}

export function useArtistAlbums(
  key: LibraryAlbumArtistKey,
  sortKey: LibraryArtistAlbumSortKey,
  direction: LibrarySortDirection,
) {
  return useFlattenedInfiniteQuery(
    useInfiniteQuery({
      queryKey: libraryQueryKeys.artistAlbums(key, sortKey, direction),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        nativeApi().listLibraryArtistAlbums(key, pageParam, sortKey, direction),
      getNextPageParam: (page: LibraryAlbumPage) => page.nextCursor ?? undefined,
      gcTime: Infinity,
    }),
  );
}

export function useLibraryTrackForPath(path: string | null) {
  return useQuery(libraryQueryOptions.track(path));
}

function listCatalogPage(
  request: LibraryCatalogRequest,
  cursor: string | null,
): Promise<CatalogPage> {
  const api = nativeApi();
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
