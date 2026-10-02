import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";
import type { AppEvent } from "$lib/native";

const waveformKeys = {
  playback: (playbackId: string | null) => ["waveform", playbackId] as const,
};

/**
 * The waveform of the loaded track, keyed by its playback id. The backend answers `null` while
 * it analyzes the file, then emits `waveformReady` with the playback id; the event refetches the
 * same query, so the event is the only way a late waveform arrives. Nothing is kept once the
 * track is no longer loaded: a file can be replaced at the same path, and the backend decides
 * whether its remembered waveform still fits.
 */
export function waveformQueryOptions(playbackId: string | null) {
  return queryOptions({
    queryKey: waveformKeys.playback(playbackId),
    queryFn: playbackId === null ? skipToken : () => requireNative().getPlaybackWaveform(),
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function applyWaveformEvent(client: QueryClient, event: AppEvent) {
  if (event.event !== "waveformReady") return;
  const queryKey = waveformKeys.playback(event.payload.playbackId);
  // A fetch still in flight asked before the analysis finished, so its answer is the stale
  // "not yet". Invalidating alone would join it (a query without data ignores `cancelRefetch`),
  // and `staleTime: Infinity` would then keep that answer; cancel it so the refetch asks again.
  void client.cancelQueries({ queryKey }).then(() => client.invalidateQueries({ queryKey }));
}
