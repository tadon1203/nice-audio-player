import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { libraryQueryKeys } from "$lib/library/queries";
import { LibraryScanState } from "$lib/library/library-scan-state.svelte";
import { lyricsQueryKeys } from "$lib/lyrics/queries";
import type { LibraryScanSnapshot, LibraryScanState as ScanStateName } from "$lib/native";
import { createScanWatcher } from "./scan-finished";

function scanSnapshot(
  state: ScanStateName,
  finishedCount: number,
  changedCount = 0,
): LibraryScanSnapshot {
  return {
    state,
    currentRoot: null,
    expectedCount: 0,
    discoveredCount: 0,
    inspectedCount: 0,
    indexedCount: 0,
    failedCount: 0,
    failureCode: null,
    finishedCount,
    changedCount,
  };
}

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const scan = new LibraryScanState();
  return { client, invalidate, scan, watch: createScanWatcher(client, scan) };
}

describe("createScanWatcher", () => {
  it("keeps the scan state without refreshing while a scan runs", () => {
    const { scan, invalidate, watch } = setup();

    watch(scanSnapshot("running", 0));

    expect(scan.snapshot?.state).toBe("running");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("refreshes the Library and lyrics once when a scan that changed something finishes", () => {
    const { invalidate, watch } = setup();

    watch(scanSnapshot("running", 0));
    watch(scanSnapshot("completed", 1, 3));
    watch(scanSnapshot("completed", 1, 3));

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.data });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: lyricsQueryKeys.all });
  });

  it("leaves the Library alone after a scan that changed nothing", () => {
    const { invalidate, watch } = setup();

    watch(scanSnapshot("completed", 1, 0));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: lyricsQueryKeys.all });
  });

  it("never misses back-to-back scans, even when the running snapshot between them is dropped", () => {
    const { invalidate, watch } = setup();

    watch(scanSnapshot("completed", 1, 2));
    watch(scanSnapshot("completed", 2, 2));
    watch(scanSnapshot("failed", 3, 5));

    expect(invalidate).toHaveBeenCalledTimes(2 + 3);
  });

  it("starts a deep list over from its first page instead of refetching every page", () => {
    const { client, invalidate, watch } = setup();
    const key = [...libraryQueryKeys.data, "catalog", { presentation: "tracks" }];
    client.setQueryData(key, { pages: [1, 2, 3, 4], pageParams: [null, "a", "b", "c"] });

    watch(scanSnapshot("completed", 1, 1));

    expect(client.getQueryData(key)).toEqual({ pages: [1], pageParams: [null] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.data });
  });
});
