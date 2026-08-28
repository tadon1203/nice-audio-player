import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PlaybackQueueMoveDirection,
  PlaybackQueueSnapshot,
  PlaybackRepeatMode,
} from "@/bindings";
import {
  clearPlaybackQueue,
  getPlaybackQueue,
  listenToPlaybackQueue,
  movePlaybackQueueItem,
  removePlaybackQueueItem,
  setPlaybackRepeatMode,
  setPlaybackShuffle,
} from "@/api/playback-queue";
import { diagnostics } from "@/lib/diagnostics";

const emptyQueue: PlaybackQueueSnapshot = {
  revision: 0,
  current: null,
  upcoming: [],
  repeatMode: "off",
  shuffleEnabled: false,
};

export function usePlaybackQueue() {
  const [snapshot, setSnapshot] = useState(emptyQueue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const revisionRef = useRef(0);
  const accept = useCallback((next: PlaybackQueueSnapshot) => {
    if (next.revision <= revisionRef.current) return false;
    revisionRef.current = next.revision;
    setSnapshot(next);
    return true;
  }, []);
  const refresh = useCallback(async () => {
    try {
      accept(await getPlaybackQueue());
      setError(null);
    } catch (cause) {
      diagnostics.error("frontend.playback_queue.sync_failed", {
        cause,
        context: { revision: revisionRef.current },
      });
      setError("The queue could not be synchronized.");
    }
  }, [accept]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        unsubscribe = await listenToPlaybackQueue(
          (next) => {
            if (active) accept(next);
          },
          () => {
            diagnostics.warn("frontend.playback_queue.subscription_failed", {
              context: { revision: revisionRef.current },
            });
            if (active) setError("Queue updates could not be read.");
          },
        );
        if (active) await refresh();
      } catch (cause) {
        diagnostics.error("frontend.playback_queue.sync_failed", {
          cause,
          context: { revision: revisionRef.current },
        });
        if (active) setError("The queue could not be synchronized.");
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [accept, refresh]);
  const run = useCallback(
    async (operation: () => Promise<PlaybackQueueSnapshot>) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      try {
        accept(await operation());
      } catch (cause) {
        diagnostics.warn("frontend.playback_queue.mutation_failed", {
          cause,
          context: { revision: revisionRef.current },
        });
        setError("The queue change could not be applied.");
        await refresh();
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [accept, refresh],
  );
  return {
    ...snapshot,
    error,
    pending,
    refresh,
    setRepeatMode: (mode: PlaybackRepeatMode) => run(() => setPlaybackRepeatMode(mode)),
    setShuffle: (enabled: boolean) => run(() => setPlaybackShuffle(enabled)),
    removeItem: (id: string) => run(() => removePlaybackQueueItem(id)),
    moveItem: (id: string, direction: PlaybackQueueMoveDirection) =>
      run(() => movePlaybackQueueItem(id, direction)),
    clearUpcoming: () => run(clearPlaybackQueue),
  };
}
