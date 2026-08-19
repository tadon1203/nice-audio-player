import { useCallback, useEffect, useRef, useState } from "react";
import { getLibraryAlbumDetails, listLibraryAlbumTracks } from "@/api/library";
import type { LibraryAlbumDetails, LibraryAlbumTrackSummary } from "@/bindings";
import { formatLibraryQueryError } from "./library-query-error";

export function useAlbumDetailQuery(albumId: string | null, refreshKey: number, enabled: boolean) {
  const [details, setDetails] = useState<LibraryAlbumDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryAlbumTrackSummary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const generation = useRef(0);
  const loadDetails = useCallback(async () => {
    if (!albumId) return;
    const current = generation.current;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const nextDetails = await getLibraryAlbumDetails(albumId);
      if (current === generation.current) setDetails(nextDetails);
    } catch (cause) {
      if (current === generation.current) setDetailsError(formatLibraryQueryError(cause, "albums"));
    } finally {
      if (current === generation.current) setDetailsLoading(false);
    }
  }, [albumId]);
  const loadTracks = useCallback(async () => {
    if (!albumId) return;
    const current = generation.current;
    setTracksLoading(true);
    setTracksError(null);
    try {
      const page = await listLibraryAlbumTracks(albumId, 0);
      if (current === generation.current) {
        setItems(page.items);
        setNextOffset(page.nextOffset);
      }
    } catch (cause) {
      if (current === generation.current) setTracksError(formatLibraryQueryError(cause, "albums"));
    } finally {
      if (current === generation.current) setTracksLoading(false);
    }
  }, [albumId]);
  useEffect(() => {
    if (!enabled || !albumId) return;
    generation.current += 1;
    const timer = window.setTimeout(() => {
      setDetails(null);
      setDetailsError(null);
      setItems([]);
      setNextOffset(null);
      setTracksError(null);
      void loadDetails();
      void loadTracks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [albumId, enabled, loadDetails, loadTracks, refreshKey]);
  const loadNext = useCallback(async () => {
    if (!albumId || nextOffset === null || loadingNext) return;
    const current = generation.current;
    setLoadingNext(true);
    setTracksError(null);
    try {
      const page = await listLibraryAlbumTracks(albumId, nextOffset);
      if (current === generation.current) {
        setItems((old) => [...old, ...page.items]);
        setNextOffset(page.nextOffset);
      }
    } catch (cause) {
      if (current === generation.current) setTracksError(formatLibraryQueryError(cause, "albums"));
    } finally {
      if (current === generation.current) setLoadingNext(false);
    }
  }, [albumId, loadingNext, nextOffset]);
  return {
    details: { value: details, loading: detailsLoading, error: detailsError, retry: loadDetails },
    tracks: {
      items,
      nextOffset,
      loading: tracksLoading,
      loadingNext,
      error: tracksError,
      retry: loadTracks,
      loadNext,
    },
  };
}
