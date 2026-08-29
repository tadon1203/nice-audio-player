import { useCallback, useEffect, useReducer, useRef } from "react";
import { getPlaybackState, listenToPlaybackState } from "@/api/audio-files";
import type { PlaybackSnapshot } from "@/bindings";
import { diagnostics } from "@/lib/diagnostics";
import { initialPlaybackUiState, playbackUiReducer } from "@/lib/playback-state";

export function usePlaybackSession() {
  const [playbackUi, dispatchPlaybackUi] = useReducer(playbackUiReducer, initialPlaybackUiState);
  const latestPlaybackRef = useRef(playbackUi.snapshot);
  const healthyRef = useRef(true);
  const applySnapshot = useCallback((snapshot: PlaybackSnapshot) => {
    if (snapshot.revision <= latestPlaybackRef.current.revision) return false;
    latestPlaybackRef.current = snapshot;
    dispatchPlaybackUi({ type: "snapshotReceived", snapshot });
    return true;
  }, []);
  const refreshAuthoritativeSnapshot = useCallback(async () => {
    try {
      applySnapshot(await getPlaybackState());
    } catch (cause) {
      diagnostics.error("frontend.playback.sync_failed", { cause });
      dispatchPlaybackUi({
        type: "connectionUnavailable",
        message: "The playback service could not be synchronized.",
      });
    }
  }, [applySnapshot]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        unsubscribe = await listenToPlaybackState(
          (snapshot) => {
            if (active) applySnapshot(snapshot);
          },
          () => {
            healthyRef.current = false;
            diagnostics.error("frontend.playback.subscription_failed");
            dispatchPlaybackUi({
              type: "connectionUnavailable",
              message: "Playback updates could not be read.",
            });
          },
        );
        const snapshot = await getPlaybackState();
        if (active) {
          applySnapshot(snapshot);
          if (healthyRef.current) dispatchPlaybackUi({ type: "connectionReady" });
        }
      } catch (cause) {
        diagnostics.error("frontend.playback.sync_failed", { cause });
        if (active)
          dispatchPlaybackUi({
            type: "connectionUnavailable",
            message: "The playback service could not be synchronized.",
          });
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySnapshot]);
  return {
    playbackUi,
    playback: playbackUi.snapshot,
    dispatchPlaybackUi,
    applySnapshot,
    refreshAuthoritativeSnapshot,
  };
}
