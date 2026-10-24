import type { CatalogRepository } from "#lib/library/catalog-repository";
import type { LyricsRepository } from "#lib/lyrics/lyrics-repository";
import { Replica } from "#lib/native/replica.svelte";
import { type ScanState, type Revisioned } from "#lib/native/bindings";

/**
 * The Library scan as the Backend last reported it. When a scan ends, it refreshes what depends on
 * the files: lyrics always, the catalog only if the scan changed something. Both are read from
 * counters that only grow, so a scan is never missed because the snapshots in between were
 * coalesced, and a scan that found nothing new costs no refetch. The one place that decides
 * "scan finished".
 */
export class ScanWatcher {
  readonly #replica = new Replica<ScanState>();
  readonly #catalog: CatalogRepository;
  readonly #lyrics: LyricsRepository;
  #finished = 0;
  #changed = 0;

  public constructor(catalog: CatalogRepository, lyrics: LyricsRepository) {
    this.#catalog = catalog;
    this.#lyrics = lyrics;
  }

  /** The scan as the Backend last reported it; `null` until the first report arrives. */
  public get snapshot(): ScanState | null {
    return this.#replica.value;
  }

  public accept(incoming: Revisioned<ScanState>): void {
    if (!this.#replica.accept(incoming)) return;
    const snapshot = incoming.value;
    if (snapshot.finishedCount <= this.#finished) return;
    this.#finished = snapshot.finishedCount;
    if (snapshot.changedCount > this.#changed) {
      this.#changed = snapshot.changedCount;
      this.#catalog.refresh();
    }
    this.#lyrics.refresh();
  }
}
