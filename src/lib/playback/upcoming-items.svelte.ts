import type { PlaybackQueueItem } from "#lib/native";
import type { Playback } from "./playback.svelte";

/** Upcoming items are read this many at a time from the backend. */
const CHUNK = 100;
/** A failed chunk read is tried this many times in all. See ADR 0007. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

type Loaded = { revision: number | null; chunks: ReadonlyMap<number, PlaybackQueueItem[]> };

/**
 * The upcoming queue as a lookup by index. The queue snapshot carries only the first part of a
 * long queue; the rest is read in chunks around `range` (the rows on screen) and kept for the
 * queue revision it was cut from. An index that has not arrived yet gives `undefined`.
 * Construct it during component initialization: it owns an `$effect`.
 */
export class UpcomingItems {
  readonly #playback: Playback;
  #loaded = $state.raw<Loaded>({ revision: null, chunks: new Map() });
  readonly #inFlight = new Set<string>();
  readonly #attempts = new Map<string, number>();

  public constructor(playback: Playback, range: () => { start: number; end: number } | null) {
    this.#playback = playback;
    $effect(() => {
      const queue = playback.queue;
      const revision = playback.queueRevision;
      const visible = range();
      if (queue === null || revision === null || visible === null) return;
      const total = queue.upcomingCount;
      const { start, end } = visible;
      const first = Math.max(start, queue.upcoming.length);
      for (let chunk = Math.floor(first / CHUNK); chunk * CHUNK < total && chunk * CHUNK <= end;) {
        this.#fetchChunk(chunk, revision);
        chunk += 1;
      }
    });
  }

  /** The upcoming item at `index`, or undefined while it has not arrived. */
  public at(index: number): PlaybackQueueItem | undefined {
    const prefix = this.#playback.queue?.upcoming ?? [];
    if (index < prefix.length) return prefix[index];
    if (this.#loaded.revision !== this.#playback.queueRevision) return undefined;
    return this.#loaded.chunks.get(Math.floor(index / CHUNK))?.[index % CHUNK];
  }

  #fetchChunk(chunk: number, revision: number): void {
    const key = `${revision}:${chunk}`;
    const have = this.#loaded.revision === revision && this.#loaded.chunks.has(chunk);
    if (have || this.#inFlight.has(key)) return;
    this.#inFlight.add(key);
    void this.#playback
      .fetchQueueWindow(chunk * CHUNK, CHUNK)
      .then((result) => {
        this.#attempts.delete(key);
        const chunks = new Map(
          this.#loaded.revision === result.revision ? this.#loaded.chunks : [],
        );
        chunks.set(Math.floor(result.offset / CHUNK), result.items);
        this.#loaded = { revision: result.revision, chunks };
      })
      .catch(() => this.#retryLater(chunk, revision, key))
      .finally(() => this.#inFlight.delete(key));
  }

  /** Tries a failed chunk again after a delay, while the queue is still the same revision. */
  #retryLater(chunk: number, revision: number, key: string): void {
    const attempts = (this.#attempts.get(key) ?? 0) + 1;
    this.#attempts.set(key, attempts);
    if (attempts >= MAX_ATTEMPTS) return;
    setTimeout(() => {
      if (this.#playback.queueRevision === revision) this.#fetchChunk(chunk, revision);
    }, RETRY_DELAY_MS);
  }
}
