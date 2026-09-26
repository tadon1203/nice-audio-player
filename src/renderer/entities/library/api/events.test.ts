import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AppEvent, LibraryScanSnapshot, LibraryScanState } from "@/shared/ipc";
import { applyLibraryEvent } from "./events";
import { libraryQueryKeys } from "./queries";

function scanEvent(state: LibraryScanState): AppEvent {
  const payload: LibraryScanSnapshot = {
    state,
    currentRoot: null,
    discoveredCount: 0,
    inspectedCount: 0,
    indexedCount: 0,
    failedCount: 0,
    failureCode: null,
  };
  return { event: "libraryScanStateChanged", payload };
}

describe("applyLibraryEvent", () => {
  it("caches the scan snapshot without invalidating while a scan runs", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyLibraryEvent(client, scanEvent("running"));

    expect(client.getQueryData<LibraryScanSnapshot>(libraryQueryKeys.scan)?.state).toBe("running");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates catalog data once when a scan reaches a terminal state", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyLibraryEvent(client, scanEvent("running"));
    applyLibraryEvent(client, scanEvent("completed"));
    applyLibraryEvent(client, scanEvent("completed"));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.data });
  });

  it("ignores events that are not about the library", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyLibraryEvent(client, { event: "applicationActivitiesChanged", payload: [] });

    expect(client.getQueryData(libraryQueryKeys.scan)).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
