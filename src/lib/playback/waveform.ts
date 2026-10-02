import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";
import type { AppEvent, PlaybackWaveform } from "$lib/native";

const waveformKeys = {
  playback: (playbackId: string | null) => ["waveform", playbackId] as const,
};

/**
 * The waveform of the loaded track, keyed by its playback id: `null` while the backend analyzes
 * the file. The backend pushes every waveform it has (`waveformChanged`, a quick approximation
 * and then the exact one), and `applyWaveformEvent` writes it here; the query itself only asks
 * once, for a track whose waveform was ready before anyone was watching. Nothing is kept once the
 * track is no longer loaded: a file can be replaced at the same path, and the backend decides
 * whether its remembered waveform still fits.
 */
export function waveformQueryOptions(playbackId: string | null) {
  return queryOptions({
    queryKey: waveformKeys.playback(playbackId),
    queryFn:
      playbackId === null
        ? skipToken
        : async () => {
            const waveform = await requireNative().getPlaybackWaveform();
            // The backend answers for whatever is loaded now; keep it only under its own key.
            return waveform?.playbackId === playbackId ? waveform : null;
          },
    staleTime: Infinity,
    gcTime: 0,
  });
}

/**
 * Replaces the cached waveform with a pushed one. A fetch still in flight asked before it
 * existed and would resolve with "not yet", so it is cancelled first. A playback nobody is
 * watching is not cached: it asks when it is opened.
 */
function cacheWaveform(client: QueryClient, waveform: PlaybackWaveform) {
  const queryKey = waveformKeys.playback(waveform.playbackId);
  if (client.getQueryState(queryKey) === undefined) return;
  void client.cancelQueries({ queryKey });
  client.setQueryData(queryKey, waveform);
}

export function applyWaveformEvent(client: QueryClient, event: AppEvent) {
  if (event.event === "waveformChanged") cacheWaveform(client, event.payload);
}
