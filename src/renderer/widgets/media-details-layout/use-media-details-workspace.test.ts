import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCollectionQuery } from "@/renderer/entities/library";
import { useMediaDetailsWorkspace } from "./use-media-details-workspace";

type Summary = { name: string };

function summary(state: Partial<UseQueryResult<Summary>>) {
  return { refetch: vi.fn(), ...state } as UseQueryResult<Summary>;
}

function collection(state: Partial<LibraryCollectionQuery<number>>) {
  return {
    items: [],
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...state,
  } as LibraryCollectionQuery<number>;
}

describe("useMediaDetailsWorkspace", () => {
  it("is loading while either query is pending, even if the other failed", () => {
    const state = useMediaDetailsWorkspace(
      summary({ isPending: true }),
      collection({ isError: true, error: new Error("boom") }),
    );
    expect(state.status).toBe("loading");
  });

  it("reports the summary error before the collection error", () => {
    const summaryError = new Error("summary");
    const state = useMediaDetailsWorkspace(
      summary({ isError: true, error: summaryError }),
      collection({ isError: true, error: new Error("collection") }),
    );
    expect(state).toMatchObject({ status: "error", error: summaryError });
  });

  it("stays in error rather than loadingMore when a page fetch fails", () => {
    const state = useMediaDetailsWorkspace(
      summary({ data: { name: "a" } }),
      collection({ isError: true, error: new Error("page"), isFetchingNextPage: true }),
    );
    expect(state.status).toBe("error");
  });

  it("is ready with paging state once both queries have data", () => {
    const state = useMediaDetailsWorkspace(
      summary({ data: { name: "a" } }),
      collection({ items: [1, 2], hasNextPage: true, isFetchingNextPage: true }),
    );
    expect(state).toMatchObject({
      status: "ready",
      summary: { name: "a" },
      items: [1, 2],
      hasMore: true,
      loadingMore: true,
    });
  });
});
