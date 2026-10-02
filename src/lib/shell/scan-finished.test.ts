import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { libraryQueryKeys } from "$lib/library/queries";
import { lyricsQueryKeys } from "$lib/lyrics/queries";
import type { AppEvent, LibraryScanSnapshot, LibraryScanState } from "$lib/native";
import { createScanWatcher } from "./scan-finished";

function scanEvent(state: LibraryScanState): AppEvent {
  const payload: LibraryScanSnapshot = {
    state,
    currentRoot: null,
    expectedCount: 0,
    discoveredCount: 0,
    inspectedCount: 0,
    indexedCount: 0,
    failedCount: 0,
    failureCode: null,
  };
  return { event: "libraryScanStateChanged", payload };
}

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return { client, invalidate, watch: createScanWatcher(client) };
}

describe("createScanWatcher", () => {
  it("caches the scan snapshot without refreshing while a scan runs", () => {
    const { client, invalidate, watch } = setup();

    watch(scanEvent("running"));

    expect(client.getQueryData<LibraryScanSnapshot>(libraryQueryKeys.scan)?.state).toBe("running");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("refreshes the Library and lyrics once when a scan finishes", () => {
    const { invalidate, watch } = setup();

    watch(scanEvent("running"));
    watch(scanEvent("completed"));
    watch(scanEvent("completed"));

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.data });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: lyricsQueryKeys.all });
  });

  it("refreshes again for the next scan", () => {
    const { invalidate, watch } = setup();

    watch(scanEvent("completed"));
    watch(scanEvent("running"));
    watch(scanEvent("failed"));

    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it("ignores events that are not about the library", () => {
    const { client, invalidate, watch } = setup();

    watch({ event: "applicationActivitiesChanged", payload: [] });

    expect(client.getQueryData(libraryQueryKeys.scan)).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
