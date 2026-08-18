import { useCallback, useEffect, useRef, useState } from "react";
import type { LyricsResolution } from "@/bindings";
import { getLibraryTrackLyrics, isLyricsCommandError } from "@/api/lyrics";

export type TrackLyricsState =
  | { kind: "idle"; trackId: string | null }
  | { kind: "loading"; trackId: string }
  | {
      kind: "resolved";
      trackId: string;
      resolution: Extract<LyricsResolution, { status: "resolved" }>;
    }
  | { kind: "notFound"; trackId: string }
  | { kind: "sourceFailed"; trackId: string }
  | { kind: "error"; trackId: string; message: string };

export function useTrackLyrics(trackId: string | null, active: boolean) {
  const [state, setState] = useState<TrackLyricsState>({ kind: "idle", trackId: null });
  const generation = useRef(0);
  const resolve = useCallback(() => {
    const request = ++generation.current;
    if (!active || !trackId) {
      generation.current += 1;
      return;
    }
    setState({ kind: "loading", trackId });
    void getLibraryTrackLyrics(trackId)
      .then((resolution) => {
        if (request !== generation.current) return;
        if (resolution.status === "resolved") setState({ kind: "resolved", trackId, resolution });
        else if (resolution.status === "notFound") setState({ kind: "notFound", trackId });
        else setState({ kind: "sourceFailed", trackId });
      })
      .catch((error: unknown) => {
        if (request !== generation.current) return;
        setState({
          kind: "error",
          trackId,
          message: isLyricsCommandError(error)
            ? "Lyrics couldn't be read for this track."
            : "Lyrics are temporarily unavailable.",
        });
      });
  }, [active, trackId]);
  useEffect(() => {
    queueMicrotask(resolve);
  }, [resolve]);
  const visibleState =
    state.trackId === trackId
      ? state
      : active && trackId
        ? { kind: "loading" as const, trackId }
        : { kind: "idle" as const, trackId };
  return { state: visibleState, retry: resolve };
}
