import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumSummary,
} from "@/bindings";
import { formatLibraryQueryError } from "./library-query-error";
import type { LibraryBrowseClient } from "./LibraryWorkspace";
import { usePagedLibraryQuery, type PagedLibraryQueryOptions } from "./use-paged-library-query";
import { diagnostics } from "@/lib/diagnostics";

export function useAlbumArtistDetailQuery(
  artistKey: LibraryAlbumArtistKey,
  seed: LibraryAlbumArtistSummary | undefined,
  refreshKey: number,
  client: LibraryBrowseClient,
  options?: PagedLibraryQueryOptions,
) {
  const [summary, setSummary] = useState<LibraryAlbumArtistSummary | null>(seed ?? null);
  const [loading, setLoading] = useState(seed === undefined);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const loadSummary = useCallback(async () => {
    const generationId = generation.current;
    setLoading(true);
    setError(null);
    try {
      const nextSummary = await client.getArtist(artistKey);
      if (generationId === generation.current) setSummary(nextSummary);
    } catch (cause) {
      if (generationId !== generation.current) return;
      diagnostics.warn("frontend.library.query_failed", {
        cause,
        context: { phase: "artist_detail" },
      });
      setError(cause);
    } finally {
      if (generationId === generation.current) setLoading(false);
    }
  }, [artistKey, client]);

  useEffect(() => {
    generation.current += 1;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadSummary();
    });
    return () => {
      cancelled = true;
      generation.current += 1;
    };
  }, [loadSummary, refreshKey]);

  const loadPage = useCallback(
    (cursor: string | null) => client.listArtistAlbums(artistKey, cursor),
    [artistKey, client],
  );
  const albums = usePagedLibraryQuery<LibraryAlbumSummary, string>(
    loadPage,
    `artist-albums:${JSON.stringify(artistKey)}:${refreshKey}`,
    true,
    options,
  );
  return {
    summary,
    summaryLoading: loading,
    summaryError: error ? formatLibraryQueryError(error, "album artists") : null,
    retrySummary: loadSummary,
    albums,
  };
}
