import { useCallback, useEffect, useRef, useState } from "react";
import { getLibraryAlbumDetails, listLibraryAlbumTracks } from "@/api/library";
import type { LibraryAlbumDetails, LibraryAlbumKey, LibraryAlbumTrackSummary } from "@/bindings";
import { formatLibraryQueryError } from "./library-query-error";
import type { LibraryBrowseClient } from "./LibraryWorkspace";
import { usePagedLibraryQuery, type PagedLibraryQueryOptions } from "./use-paged-library-query";

export function useAlbumDetailQuery(
  albumKey: LibraryAlbumKey | null,
  refreshKey: number,
  enabled: boolean,
  client?: LibraryBrowseClient,
  options?: PagedLibraryQueryOptions,
) {
  const [details, setDetails] = useState<LibraryAlbumDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const detailsGeneration = useRef(0);
  const loadDetails = useCallback(async () => {
    if (!albumKey) return;
    const generation = detailsGeneration.current;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const nextDetails = await (client?.getAlbumDetails ?? getLibraryAlbumDetails)(albumKey);
      if (generation === detailsGeneration.current) setDetails(nextDetails);
    } catch (cause) {
      if (generation === detailsGeneration.current) {
        setDetailsError(formatLibraryQueryError(cause, "albums"));
      }
    } finally {
      if (generation === detailsGeneration.current) setDetailsLoading(false);
    }
  }, [albumKey, client]);

  useEffect(() => {
    if (!enabled || !albumKey) return;
    detailsGeneration.current += 1;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadDetails();
    });
    return () => {
      cancelled = true;
      detailsGeneration.current += 1;
    };
  }, [albumKey, enabled, loadDetails, refreshKey]);

  const loadTrackPage = useCallback(
    async (offset: number | null) => {
      if (!albumKey) return { items: [], nextCursor: null };
      const page = await (client?.listAlbumTracks ?? listLibraryAlbumTracks)(albumKey, offset ?? 0);
      return { items: page.items, nextCursor: page.nextOffset };
    },
    [albumKey, client],
  );
  const tracksQuery = usePagedLibraryQuery<LibraryAlbumTrackSummary, number>(
    loadTrackPage,
    albumKey ? `album-tracks:${JSON.stringify(albumKey)}:${refreshKey}` : "album-tracks:disabled",
    enabled && albumKey !== null,
    options,
  );

  return {
    details: {
      value: details,
      loading: detailsLoading,
      error: detailsError,
      retry: loadDetails,
    },
    tracks: {
      items: tracksQuery.items,
      nextOffset: tracksQuery.nextCursor,
      loading: tracksQuery.loading,
      loadingNext: tracksQuery.loadingNext,
      error: tracksQuery.error ? formatLibraryQueryError(tracksQuery.error, "albums") : null,
      retry: tracksQuery.retry,
      loadNext: tracksQuery.loadNext,
    },
  };
}
