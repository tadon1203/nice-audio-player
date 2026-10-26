import { describe, expect, it, vi, type Mock } from "vitest";
import type { CatalogRepository } from "#lib/library/catalog-repository";
import type { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import { type ScanState, type ScanStatus as ScanStateName } from "#lib/native/bindings";
import { ScanWatcher } from "./scan-watcher.svelte";

function scanSnapshot(state: ScanStateName, libraryVersion: number): ScanState {
  return {
    state,
    currentDirectory: null,
    expectedCount: 0,
    progress: null,
    discoveredCount: 0,
    inspectedCount: 0,
    indexedCount: 0,
    failedCount: 0,
    failureCode: null,
    libraryVersion,
  };
}

/** Each accepted snapshot gets the next version, so the replica keeps every one of them. */
let version = 0;
const versioned = (value: ScanState): { version: number; value: ScanState } => ({
  version: ++version,
  value,
});

function setup(): {
  catalog: { refresh: Mock };
  lyrics: { refresh: Mock };
  watcher: ScanWatcher;
  accept: (value: ScanState) => void;
} {
  const catalog = { refresh: vi.fn() };
  const lyrics = { refresh: vi.fn() };
  const watcher = new ScanWatcher(
    catalog as unknown as CatalogRepository,
    lyrics as unknown as LyricsRepository,
  );
  const accept = (value: ScanState): void => watcher.accept(versioned(value));
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

  it("refreshes the catalog and lyrics once when the Library version moves", () => {
    const { catalog, lyrics, accept } = setup();

    accept(scanSnapshot("running", 0));
    accept(scanSnapshot("completed", 1));
    accept(scanSnapshot("completed", 1));

    expect(catalog.refresh).toHaveBeenCalledTimes(1);
    expect(lyrics.refresh).toHaveBeenCalledTimes(1);
  });

  it("never misses back-to-back scans, even when the running snapshot between them is dropped", () => {
    const { catalog, lyrics, accept } = setup();

    accept(scanSnapshot("completed", 1));
    accept(scanSnapshot("completed", 2));
    accept(scanSnapshot("failed", 3));

    expect(catalog.refresh).toHaveBeenCalledTimes(3);
    expect(lyrics.refresh).toHaveBeenCalledTimes(3);
  });

  it("ignores a snapshot whose version is not newer than the one it holds", () => {
    const { watcher, catalog } = setup();
    const newer = versioned(scanSnapshot("completed", 1));
    watcher.accept(newer);

    watcher.accept({ version: newer.version, value: scanSnapshot("completed", 2) });

    expect(watcher.snapshot?.libraryVersion).toBe(1);
    expect(catalog.refresh).toHaveBeenCalledTimes(1);
  });
});
