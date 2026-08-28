import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryQueryRetention } from "./LibraryWorkspace";
import { diagnostics } from "@/lib/diagnostics";

export interface PagedLibraryPage<TItem, TCursor> {
  items: TItem[];
  nextCursor: TCursor | null;
}
export interface PagedLibraryQueryOptions {
  retention?: {
    key: string;
    registry: LibraryQueryRetention;
  };
}
export interface PagedLibraryQueryResult<TItem, TCursor> {
  pages: TItem[][];
  items: TItem[];
  nextCursor: TCursor | null;
  loading: boolean;
  loadingNext: boolean;
  error: unknown;
  retry: () => Promise<void>;
  loadNext: () => Promise<void>;
}

export function usePagedLibraryQuery<TItem, TCursor>(
  loadPage: (cursor: TCursor | null) => Promise<PagedLibraryPage<TItem, TCursor>>,
  ownerKey: string,
  enabled = true,
  options?: PagedLibraryQueryOptions,
): PagedLibraryQueryResult<TItem, TCursor> {
  const initialSnapshot = options?.retention
    ? options.retention.registry.get<TItem, TCursor>(options.retention.key)
    : undefined;
  const initialPages = initialSnapshot?.ownerKey === ownerKey ? initialSnapshot.pages : [];
  const initialNextCursor =
    initialSnapshot?.ownerKey === ownerKey ? initialSnapshot.nextCursor : null;
  const [pages, setPages] = useState<TItem[][]>(() => initialPages);
  const [nextCursor, setNextCursor] = useState<TCursor | null>(() => initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [committedOwner, setCommittedOwner] = useState(ownerKey);
  const generation = useRef(0);
  const nextRequest = useRef<{ generation: number; cursor: TCursor } | null>(null);
  const ownerRef = useRef(ownerKey);
  const pagesRef = useRef(initialPages);
  const nextCursorRef = useRef(initialNextCursor);
  const retentionKey = options?.retention?.key;
  const retentionRegistry = options?.retention?.registry;

  const publishSnapshot = useCallback(
    (nextPages: TItem[][], cursor: TCursor | null, currentOwner: string) => {
      if (!retentionRegistry || !retentionKey) return;
      retentionRegistry.set(retentionKey, {
        ownerKey: currentOwner,
        pages: nextPages,
        nextCursor: cursor,
      });
    },
    [retentionKey, retentionRegistry],
  );
  const loadFirst = useCallback(async () => {
    const generationId = ++generation.current;
    const currentOwner = ownerRef.current;
    nextRequest.current = null;
    nextCursorRef.current = null;
    setNextCursor(null);
    setLoading(true);
    setLoadingNext(false);
    setError(null);
    try {
      const page = await loadPage(null);
      if (generationId !== generation.current || currentOwner !== ownerRef.current) return;
      const nextPages = [page.items];
      pagesRef.current = nextPages;
      nextCursorRef.current = page.nextCursor;
      setPages(nextPages);
      setNextCursor(page.nextCursor);
      publishSnapshot(nextPages, page.nextCursor, currentOwner);
    } catch (cause) {
      if (generationId !== generation.current || currentOwner !== ownerRef.current) return;
      diagnostics.warn("frontend.library.query_failed", { cause, context: { phase: "initial" } });
      setError(cause);
    } finally {
      if (generationId === generation.current && currentOwner === ownerRef.current) {
        setLoading(false);
      }
    }
  }, [loadPage, publishSnapshot]);

  useEffect(() => {
    ownerRef.current = ownerKey;
    generation.current += 1;
    nextRequest.current = null;
    nextCursorRef.current = null;
    const snapshot = retentionRegistry?.get<TItem, TCursor>(retentionKey ?? "");
    const hydrated = snapshot?.ownerKey === ownerKey;
    const nextPages = hydrated ? snapshot.pages : [];
    pagesRef.current = nextPages;
    nextCursorRef.current = hydrated ? snapshot.nextCursor : null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCommittedOwner(ownerKey);
      setPages(nextPages);
      setNextCursor(hydrated ? snapshot.nextCursor : null);
      setError(null);
      if (!enabled) {
        setLoading(false);
        setLoadingNext(false);
      } else if (!hydrated) {
        void loadFirst();
      }
    });
    return () => {
      cancelled = true;
      generation.current += 1;
      nextRequest.current = null;
    };
  }, [enabled, loadFirst, ownerKey, retentionKey, retentionRegistry]);

  const loadNext = useCallback(async () => {
    const cursor = nextCursorRef.current;
    const currentOwner = ownerRef.current;
    const generationId = generation.current;
    if (cursor === null || !enabled || nextRequest.current) return;
    nextRequest.current = { generation: generationId, cursor };
    setLoadingNext(true);
    try {
      const page = await loadPage(cursor);
      if (
        generationId !== generation.current ||
        currentOwner !== ownerRef.current ||
        nextRequest.current?.generation !== generationId ||
        nextRequest.current.cursor !== cursor
      ) {
        return;
      }
      const nextPages = [...pagesRef.current, page.items];
      pagesRef.current = nextPages;
      nextCursorRef.current = page.nextCursor;
      setPages(nextPages);
      setNextCursor(page.nextCursor);
      publishSnapshot(nextPages, page.nextCursor, currentOwner);
    } catch (cause) {
      const ownsRequest =
        generationId === generation.current &&
        currentOwner === ownerRef.current &&
        nextRequest.current?.generation === generationId &&
        nextRequest.current.cursor === cursor;
      if (!ownsRequest) return;
      diagnostics.warn("frontend.library.query_failed", { cause, context: { phase: "next" } });
      setError(cause);
    } finally {
      if (
        nextRequest.current?.generation === generationId &&
        nextRequest.current.cursor === cursor
      ) {
        nextRequest.current = null;
        if (generationId === generation.current && currentOwner === ownerRef.current) {
          setLoadingNext(false);
        }
      }
    }
  }, [enabled, loadPage, publishSnapshot]);

  const ownerIsCurrent = committedOwner === ownerKey;
  return {
    pages: ownerIsCurrent ? pages : [],
    items: ownerIsCurrent ? pages.flat() : [],
    nextCursor: ownerIsCurrent ? nextCursor : null,
    loading: ownerIsCurrent ? loading : enabled,
    loadingNext: ownerIsCurrent ? loadingNext : false,
    error: ownerIsCurrent ? error : null,
    retry: loadFirst,
    loadNext,
  };
}
