/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePagedLibraryQuery, type PagedLibraryPage } from "./use-paged-library-query";
import type { LibraryQueryRetention, RetainedPagedLibrarySnapshot } from "./LibraryWorkspace";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("usePagedLibraryQuery", () => {
  it("atomically replaces a refresh and ignores an older generation", async () => {
    const first = deferred<PagedLibraryPage<string, string>>();
    const second = deferred<PagedLibraryPage<string, string>>();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<PagedLibraryPage<string, string>>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ owner }) => usePagedLibraryQuery(loadPage, owner), {
      initialProps: { owner: "albums:" },
    });
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    rerender({ owner: "albums:new-filter" });
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));

    await act(async () => first.resolve({ items: ["stale"], nextCursor: null }));
    expect(result.current.items).toEqual([]);
    await act(async () => second.resolve({ items: ["fresh"], nextCursor: null }));
    await waitFor(() => expect(result.current.items).toEqual(["fresh"]));
  });

  it("suppresses duplicate next-page requests", async () => {
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<PagedLibraryPage<number, string>>>()
      .mockResolvedValueOnce({ items: [1], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [2], nextCursor: null });
    const { result } = renderHook(() => usePagedLibraryQuery(loadPage, "tracks:"));
    await waitFor(() => expect(result.current.items).toEqual([1]));
    await act(async () => {
      await Promise.all([result.current.loadNext(), result.current.loadNext()]);
    });
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([1, 2]);
  });

  it("retires an old cursor when the owner changes during next-page loading", async () => {
    const oldNext = deferred<PagedLibraryPage<number, string>>();
    const newFirst = deferred<PagedLibraryPage<number, string>>();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<PagedLibraryPage<number, string>>>()
      .mockResolvedValueOnce({ items: [1], nextCursor: "old-next" })
      .mockReturnValueOnce(oldNext.promise)
      .mockReturnValueOnce(newFirst.promise);
    const { result, rerender } = renderHook(({ owner }) => usePagedLibraryQuery(loadPage, owner), {
      initialProps: { owner: "old" },
    });
    await waitFor(() => expect(result.current.items).toEqual([1]));
    const pendingNext = result.current.loadNext();
    rerender({ owner: "new" });
    expect(result.current.items).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    await waitFor(() => expect(loadPage).toHaveBeenLastCalledWith(null));
    await act(async () => oldNext.resolve({ items: [2], nextCursor: null }));
    await act(async () => newFirst.resolve({ items: [10], nextCursor: "new-next" }));
    await pendingNext;
    await waitFor(() => expect(result.current.items).toEqual([10]));
    expect(result.current.nextCursor).toBe("new-next");
  });

  it("hydrates a retained successful snapshot without rebuilding the first page", async () => {
    const snapshots = new Map<string, unknown>();
    const retention: LibraryQueryRetention = {
      get: <TItem, TCursor>(key: string) =>
        snapshots.get(key) as RetainedPagedLibrarySnapshot<TItem, TCursor> | undefined,
      set: <TItem, TCursor>(key: string, snapshot: RetainedPagedLibrarySnapshot<TItem, TCursor>) =>
        snapshots.set(key, snapshot),
      delete: (key) => snapshots.delete(key),
      register: () => undefined,
      release: (key) => {
        snapshots.delete(key);
      },
    };
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<PagedLibraryPage<number, string>>>()
      .mockResolvedValueOnce({ items: [1], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [2], nextCursor: null });
    const first = renderHook(() =>
      usePagedLibraryQuery(loadPage, "owner", true, {
        retention: { key: "root:albums", registry: retention },
      }),
    );
    await waitFor(() => expect(first.result.current.items).toEqual([1]));
    await act(async () => first.result.current.loadNext());
    expect(first.result.current.items).toEqual([1, 2]);
    first.unmount();
    const second = renderHook(() =>
      usePagedLibraryQuery(loadPage, "owner", true, {
        retention: { key: "root:albums", registry: retention },
      }),
    );
    expect(second.result.current.items).toEqual([1, 2]);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });
});
