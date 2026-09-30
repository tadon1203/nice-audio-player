import type { PlaybackQueueItem } from "$lib/native";
import type { Playback } from "./playback.svelte";

/** Upcoming items are read this many at a time from the backend. */
const CHUNK = 100;

type Loaded = { revision: number | null; chunks: ReadonlyMap<number, PlaybackQueueItem[]> };

/**
 * The upcoming queue as a lookup by index. The queue snapshot carries only the first part of a
 * long queue; the rest is read in chunks around `range` (the rows on screen) and kept for the
 * queue revision it was cut from. An index that has not arrived yet gives `undefined`.
 * Call from component initialization: it owns an `$effect`.
 */
export function createUpcomingItems(
  playback: Playback,
  range: () => { start: number; end: number } | null,
) {
  let loaded = $state.raw<Loaded>({ revision: null, chunks: new Map() });
  const inFlight = new Set<string>();

  $effect(() => {
    const queue = playback.queue;
    const visible = range();
    if (queue === null || visible === null) return;
    const revision = queue.revision;
    const total = queue.upcomingCount;
    const { start, end } = visible;
    const first = Math.max(start, queue.upcoming.length);
    for (let chunk = Math.floor(first / CHUNK); chunk * CHUNK < total && chunk * CHUNK <= end; ) {
      const key = `${revision}:${chunk}`;
      const have = loaded.revision === revision && loaded.chunks.has(chunk);
      if (!have && !inFlight.has(key)) {
        inFlight.add(key);
        void playback
          .fetchQueueWindow(chunk * CHUNK, CHUNK)
          .then((result) => {
            const chunks = new Map(loaded.revision === result.revision ? loaded.chunks : []);
            chunks.set(Math.floor(result.offset / CHUNK), result.items);
            loaded = { revision: result.revision, chunks };
          })
          .catch(() => undefined)
          .finally(() => inFlight.delete(key));
      }
      chunk += 1;
    }
  });

  return {
    at(index: number): PlaybackQueueItem | undefined {
      const queue = playback.queue;
      const prefix = queue?.upcoming ?? [];
      if (index < prefix.length) return prefix[index];
      if (loaded.revision !== (queue?.revision ?? null)) return undefined;
      return loaded.chunks.get(Math.floor(index / CHUNK))?.[index % CHUNK];
    },
  };
}
