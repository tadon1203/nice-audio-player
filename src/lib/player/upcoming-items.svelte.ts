import { type QueueItem, UPCOMING_WINDOW } from "#lib/native/bindings";
import type { Player } from "./player.svelte";

/** A failed chunk read is tried this many times in all. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

interface Loaded {
  version: number | null;
  chunks: ReadonlyMap<number, QueueItem[]>;
}

/**
 * The upcoming queue as a lookup by index. The queue snapshot carries only the first part of a
 * long queue; the rest is read in chunks around `range` (the rows on screen) and kept for the
 * queue version it was cut from. An index that has not arrived yet gives `undefined`.
 * Construct it during component initialization: it owns an `$effect`.
 */
export class UpcomingItems {
  readonly #playback: Player;
  #loaded = $state.raw<Loaded>({ version: null, chunks: new Map() });
  readonly #inFlight = new Set<string>();
  readonly #attempts = new Map<string, number>();

  public constructor(playback: Player, range: () => { start: number; end: number } | null) {
    this.#playback = playback;
    $effect(() => {
      const queue = playback.queue;
      const version = playback.queueVersion;
      const visible = range();
      if (queue === null || version === null || visible === null) return;
      const total = queue.upcomingCount;
      const { start, end } = visible;
      const first = Math.max(start, queue.upcoming.length);
      for (
        let chunk = Math.floor(first / UPCOMING_WINDOW);
        chunk * UPCOMING_WINDOW < total && chunk * UPCOMING_WINDOW <= end;
      ) {
        this.#fetchChunk(chunk, version);
        chunk += 1;
      }
    });
  }

  /** The upcoming item at `index`, or undefined while it has not arrived. */
  public at(index: number): QueueItem | undefined {
    const prefix = this.#playback.queue?.upcoming ?? [];
    if (index < prefix.length) return prefix[index];
    if (this.#loaded.version !== this.#playback.queueVersion) return undefined;
    return this.#loaded.chunks.get(Math.floor(index / UPCOMING_WINDOW))?.[index % UPCOMING_WINDOW];
  }

  #fetchChunk(chunk: number, version: number): void {
    const key = `${version}:${chunk}`;
    const have = this.#loaded.version === version && this.#loaded.chunks.has(chunk);
    if (have || this.#inFlight.has(key)) return;
    this.#inFlight.add(key);
    void this.#playback
      .fetchQueueWindow(chunk * UPCOMING_WINDOW, UPCOMING_WINDOW)
      .then((outcome) => {
        if (!outcome.ok) {
          this.#retryLater(chunk, version, key);
          return;
        }
        const window = outcome.value;
        this.#attempts.delete(key);
        const chunks = new Map(this.#loaded.version === window.version ? this.#loaded.chunks : []);
        chunks.set(Math.floor(window.offset / UPCOMING_WINDOW), window.items);
        this.#loaded = { version: window.version, chunks };
      })
      // The adapter never rejects. A rejection is retried like a failed read, to be safe.
      .catch(() => this.#retryLater(chunk, version, key))
      .finally(() => this.#inFlight.delete(key));
  }

  /** Tries a failed chunk again after a delay, while the queue is still the same version. */
  #retryLater(chunk: number, version: number, key: string): void {
    const attempts = (this.#attempts.get(key) ?? 0) + 1;
    this.#attempts.set(key, attempts);
    if (attempts >= MAX_ATTEMPTS) return;
    setTimeout(() => {
      if (this.#playback.queueVersion === version) this.#fetchChunk(chunk, version);
    }, RETRY_DELAY_MS);
  }
}
