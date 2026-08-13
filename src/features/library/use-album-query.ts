import { useCallback, useEffect, useRef, useState } from "react";
import { listLibraryAlbums } from "@/api/library";
import type { LibraryAlbumSummary } from "@/bindings";
import { formatLibraryQueryError } from "./library-query-error";

export function useAlbumQuery(search: string, libraryRefreshKey: number, enabled = true) {
  const [items, setItems] = useState<LibraryAlbumSummary[]>([]);
  const [nextAfterId, setNextAfterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const nextRequest = useRef(false);
  const loadFirst = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listLibraryAlbums(null, search || null);
      if (current !== generation.current) return;
      setItems(page.items);
      setNextAfterId(page.nextAfterId);
    } catch (error) {
      if (current === generation.current) setError(formatLibraryQueryError(error, "albums"));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void loadFirst(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, loadFirst, libraryRefreshKey]);
  const loadNext = useCallback(async () => {
    if (!nextAfterId || nextRequest.current) return;
    nextRequest.current = true;
    setError(null);
    const current = generation.current;
    try {
      const page = await listLibraryAlbums(nextAfterId, search || null);
      if (current === generation.current) {
        setItems((old) => [...old, ...page.items]);
        setNextAfterId(page.nextAfterId);
      }
    } catch (error) {
      if (current === generation.current) setError(formatLibraryQueryError(error, "albums"));
    } finally {
      nextRequest.current = false;
    }
  }, [nextAfterId, search]);
  return { items, nextAfterId, loading, error, retry: loadFirst, loadNext };
}
