import { describe, expect, it, vi, type Mock } from "vitest";
import type { CatalogRepository } from "#lib/library/catalog-repository";
import type { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import type { LibraryScanSnapshot, LibraryScanState as ScanStateName } from "#lib/native";
import { ScanWatcher } from "./scan-watcher.svelte";

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

/** Each accepted snapshot gets the next revision, so the replica keeps every one of them. */
let revision = 0;
const versioned = (
  value: LibraryScanSnapshot,
): { revision: number; value: LibraryScanSnapshot } => ({ revision: ++revision, value });

function setup(): {
  catalog: { refresh: Mock };
  lyrics: { refresh: Mock };
  watcher: ScanWatcher;
  accept: (value: LibraryScanSnapshot) => void;
} {
  const catalog = { refresh: vi.fn() };
  const lyrics = { refresh: vi.fn() };
  const watcher = new ScanWatcher(
    catalog as unknown as CatalogRepository,
    lyrics as unknown as LyricsRepository,
  );
  const accept = (value: LibraryScanSnapshot): void => watcher.accept(versioned(value));
  return { catalog, lyrics, watcher, accept };
}

describe("ScanWatcher", () => {
  it("holds the scan snapshot without refreshing while a scan runs", () => {
    const { watcher, catalog, lyrics, accept } = setup();

    accept(scanSnapshot("running", 0));

    expect(watcher.snapshot?.state).toBe("running");
    expect(catalog.refresh).not.toHaveBeenCalled();
    expect(lyrics.refresh).not.toHaveBeenCalled();
  });

  it("refreshes the catalog and lyrics once when a scan that changed something finishes", () => {
    const { catalog, lyrics, accept } = setup();

    accept(scanSnapshot("running", 0));
    accept(scanSnapshot("completed", 1, 3));
    accept(scanSnapshot("completed", 1, 3));

    expect(catalog.refresh).toHaveBeenCalledTimes(1);
    expect(lyrics.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes only the lyrics after a scan that changed nothing", () => {
    const { catalog, lyrics, accept } = setup();

    accept(scanSnapshot("completed", 1, 0));

    expect(catalog.refresh).not.toHaveBeenCalled();
    expect(lyrics.refresh).toHaveBeenCalledTimes(1);
  });

  it("never misses back-to-back scans, even when the running snapshot between them is dropped", () => {
    const { catalog, lyrics, accept } = setup();

    accept(scanSnapshot("completed", 1, 2));
    accept(scanSnapshot("completed", 2, 2));
    accept(scanSnapshot("failed", 3, 5));

    expect(catalog.refresh).toHaveBeenCalledTimes(2);
    expect(lyrics.refresh).toHaveBeenCalledTimes(3);
  });

  it("ignores a snapshot whose revision is not newer than the one it holds", () => {
    const { watcher, catalog } = setup();
    const newer = versioned(scanSnapshot("completed", 1, 1));
    watcher.accept(newer);

    watcher.accept({ revision: newer.revision, value: scanSnapshot("completed", 2, 1) });

    expect(watcher.snapshot?.finishedCount).toBe(1);
    expect(catalog.refresh).toHaveBeenCalledTimes(1);
  });
});
