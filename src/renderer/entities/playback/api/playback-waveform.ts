import { queryOptions, skipToken, useQuery, type QueryClient } from "@tanstack/react-query";
import type { AppEvent } from "@/shared/ipc";
import { nativeApi } from "@/renderer/shared/lib/native";

const RETRY_MS = 2_000;
const RETRY_LIMIT = 30;

const waveformKeys = {
  file: (path: string | null) => ["waveform", path] as const,
};

/**
 * The backend answers `null` while it analyzes a file, then emits `waveformReady`; the event
 * refetches the same query. Nothing is kept once the track is no longer loaded: a file can be
 * replaced at the same path, and the backend decides whether its remembered waveform still fits.
 *
 * `null` is cached forever (`staleTime`), so an answer that never gets its event — a missed push,
 * an analysis that failed, a snapshot that briefly disagreed with the renderer — would leave the
 * bars blank for the whole track. Asking again is cheap (the backend dedupes queued work), so a
 * `null` is re-asked for a while.
 */
function waveformOptions(path: string | null) {
  return queryOptions({
    queryKey: waveformKeys.file(path),
    queryFn: path === null ? skipToken : () => nativeApi().getPlaybackWaveform(path),
    staleTime: Infinity,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data == null && query.state.dataUpdateCount < RETRY_LIMIT ? RETRY_MS : false,
  });
}

export function usePlaybackWaveform(path: string | null) {
  return useQuery(waveformOptions(path)).data ?? null;
}

export function applyWaveformEvent(client: QueryClient, event: AppEvent) {
  if (event.event !== "waveformReady") return;
  void client.invalidateQueries({ queryKey: waveformKeys.file(event.payload.path) });
}
