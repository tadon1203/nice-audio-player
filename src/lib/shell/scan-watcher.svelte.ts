import type { CatalogRepository } from "#lib/library/catalog-repository";
import type { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import { Replica } from "#lib/native/replica.svelte";
import { type ScanState, type Versioned } from "#lib/native/bindings";

/**
 * The Library scan as the Backend last reported it. The Library version moves when a scan ends, so
 * when it moves the catalog and the lyrics are refreshed; a scan that did not end costs no
 * refetch. The version only grows, so a scan is never missed because the snapshots in between were
 * coalesced. The one place that decides "scan finished".
 */
export class ScanWatcher {
  readonly #replica = new Replica<ScanState>();
  readonly #catalog: CatalogRepository;
  readonly #lyrics: LyricsRepository;
  #libraryVersion = 0;

  public constructor(catalog: CatalogRepository, lyrics: LyricsRepository) {
    this.#catalog = catalog;
    this.#lyrics = lyrics;
  }

  /** The scan as the Backend last reported it; `null` until the first report arrives. */
  public get snapshot(): ScanState | null {
    return this.#replica.value;
  }

  public accept(incoming: Versioned<ScanState>): void {
    if (!this.#replica.accept(incoming)) return;
    const { libraryVersion } = incoming.value;
    if (libraryVersion === this.#libraryVersion) return;
    this.#libraryVersion = libraryVersion;
    this.#catalog.refresh();
    this.#lyrics.refresh();
  }
}
