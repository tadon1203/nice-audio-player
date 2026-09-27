import { queryOptions, skipToken, useQuery, type QueryClient } from "@tanstack/react-query";
import type { AppEvent } from "@/shared/ipc";
import { nativeApi } from "@/renderer/shared/lib/native";

const waveformKeys = {
  file: (path: string | null) => ["waveform", path] as const,
};

/**
 * The backend answers `null` while it analyzes a file, then emits `waveformReady`; the event
 * refetches the same query. A waveform never changes for a path, so it never goes stale.
 */
function waveformOptions(path: string | null) {
  return queryOptions({
    queryKey: waveformKeys.file(path),
    queryFn: path === null ? skipToken : () => nativeApi().getPlaybackWaveform(path),
    staleTime: Infinity,
    gcTime: 60_000,
  });
}

export function usePlaybackWaveform(path: string | null) {
  return useQuery(waveformOptions(path)).data ?? null;
}

export function applyWaveformEvent(client: QueryClient, event: AppEvent) {
  if (event.event !== "waveformReady") return;
  void client.invalidateQueries({ queryKey: waveformKeys.file(event.payload.path) });
}
