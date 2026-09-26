import { useAlbumDetails, useAlbumTracks, type LibraryAlbumKey } from "@/renderer/entities/library";

export type AlbumDetailsLoadState = "idle" | "loading" | "ready" | "loadingMore" | "error";

/** Composes Query-owned data without introducing a second async state authority. */
export function useAlbumDetailsWorkspace(key: LibraryAlbumKey | null) {
  const details = useAlbumDetails(key);
  const tracks = useAlbumTracks(key);
  const baseState: AlbumDetailsLoadState = !key
    ? "idle"
    : details.isPending || tracks.isPending
      ? "loading"
      : details.isError || tracks.isError
        ? "error"
        : "ready";

  return {
    details: details.data ?? null,
    tracks: tracks.items,
    totalCount: tracks.totalCount,
    nextCursor: tracks.nextCursor,
    loadState: tracks.isFetchingNextPage ? "loadingMore" : baseState,
    error: details.error ?? tracks.error ?? null,
    loadMore: () => (tracks.hasNextPage ? tracks.fetchNextPage() : Promise.resolve()),
    reload: () => Promise.all([details.refetch(), tracks.refetch()]),
  };
}
