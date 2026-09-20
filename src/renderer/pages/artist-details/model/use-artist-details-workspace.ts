import {
  useAlbumArtist,
  useArtistAlbums,
  type LibraryAlbumArtistKey,
  type LibraryArtistAlbumSortKey,
  type LibrarySortDirection,
} from "@/renderer/entities/library";

export type ArtistDetailsSort = {
  key: LibraryArtistAlbumSortKey;
  direction: LibrarySortDirection;
};

export function useArtistDetailsWorkspace(
  artist: LibraryAlbumArtistKey | null,
  selection: ArtistDetailsSort,
) {
  const summary = useAlbumArtist(artist);
  const albums = useArtistAlbums(artist, selection.key, selection.direction);
  const loadState = !artist
    ? "idle"
    : summary.isPending || albums.isPending
      ? "loading"
      : summary.isError || albums.isError
        ? "error"
        : albums.isFetchingNextPage
          ? "loadingMore"
          : "ready";

  return {
    artist: summary.data ?? null,
    albums: albums.items,
    totalCount: albums.totalCount,
    nextCursor: albums.nextCursor,
    loadState,
    error: summary.error ?? albums.error ?? null,
    loadMore: () => (albums.hasNextPage ? albums.fetchNextPage() : Promise.resolve()),
  };
}
