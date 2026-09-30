import { useEffect, useRef, useState } from "react";
import type { PlaybackQueueItem } from "@/shared/ipc";
import { playbackController, usePlaybackStore } from "./playback-session";

/** Upcoming items are read this many at a time from the backend. */
const CHUNK = 100;

type Loaded = { revision: number | null; chunks: ReadonlyMap<number, PlaybackQueueItem[]> };

/**
 * The upcoming queue as a lookup by index. The queue snapshot carries only the first part of a
 * long queue; the rest is read in chunks around `range` (the rows on screen) and kept for the
 * queue revision it was cut from. An index that has not arrived yet gives `undefined`.
 */
export function useUpcomingItems(range: { start: number; end: number } | null) {
  const queue = usePlaybackStore((state) => state.queue);
  const [loaded, setLoaded] = useState<Loaded>({ revision: null, chunks: new Map() });
  const inFlight = useRef(new Set<string>());
  const prefix = queue?.upcoming ?? [];
  const revision = queue?.revision ?? null;
  const total = queue?.upcomingCount ?? 0;
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    if (revision === null || start === undefined || end === undefined) return;
    const first = Math.max(start, prefix.length);
    for (let chunk = Math.floor(first / CHUNK); chunk * CHUNK < total && chunk * CHUNK <= end; ) {
      const key = `${revision}:${chunk}`;
      const have = loaded.revision === revision && loaded.chunks.has(chunk);
      if (!have && !inFlight.current.has(key)) {
        inFlight.current.add(key);
        void playbackController
          .fetchQueueWindow(chunk * CHUNK, CHUNK)
          .then((window) => {
            setLoaded((current) => {
              const chunks = new Map(current.revision === window.revision ? current.chunks : []);
              chunks.set(Math.floor(window.offset / CHUNK), window.items);
              return { revision: window.revision, chunks };
            });
          })
          .catch(() => undefined)
          .finally(() => inFlight.current.delete(key));
      }
      chunk += 1;
    }
    // `prefix` only matters through its length.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, start, end, total, prefix.length, loaded]);

  return (index: number): PlaybackQueueItem | undefined => {
    if (index < prefix.length) return prefix[index];
    if (loaded.revision !== revision) return undefined;
    return loaded.chunks.get(Math.floor(index / CHUNK))?.[index % CHUNK];
  };
}
