import { useCallback, useEffect, useRef, useState } from "react";
import { getLibraryAlbumDetails, listLibraryAlbumTracks } from "@/api/library";
import type { LibraryAlbumDetails, LibraryAlbumTrackSummary } from "@/bindings";
import { formatLibraryQueryError } from "./library-query-error";

export function useAlbumDetailQuery(albumId: string | null, refreshKey: number, enabled: boolean) {
  const [details, setDetails] = useState<LibraryAlbumDetails | null>(null);
  const [items, setItems] = useState<LibraryAlbumTrackSummary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const loadFirst = useCallback(async () => {
    if (!albumId) return;
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [nextDetails, page] = await Promise.all([
        getLibraryAlbumDetails(albumId),
        listLibraryAlbumTracks(albumId, 0),
      ]);
      if (current === generation.current) {
        setDetails(nextDetails);
        setItems(page.items);
        setNextOffset(page.nextOffset);
      }
    } catch (cause) {
      if (current === generation.current) {
        setError(formatLibraryQueryError(cause, "albums"));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [albumId]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void loadFirst(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, loadFirst, refreshKey]);
  const loadNext = useCallback(async () => {
    if (!albumId || nextOffset === null || loadingNext) return;
    const current = generation.current;
    setLoadingNext(true);
    try {
      const page = await listLibraryAlbumTracks(albumId, nextOffset);
      if (current === generation.current) {
        setItems((old) => [...old, ...page.items]);
        setNextOffset(page.nextOffset);
      }
    } catch (cause) {
      if (current === generation.current) setError(formatLibraryQueryError(cause, "albums"));
    } finally {
      setLoadingNext(false);
    }
  }, [albumId, loadingNext, nextOffset]);
  return { details, items, nextOffset, loading, loadingNext, error, retry: loadFirst, loadNext };
}
