import { createQuery } from "@tanstack/svelte-query";
import { waveformQueryOptions } from "./waveform";

/** The waveform of the playback `playbackId`, or `null` until the backend has analyzed it. */
export function createPlaybackWaveform(playbackId: () => string | null) {
  const query = createQuery(() => waveformQueryOptions(playbackId()));
  return {
    get current() {
      return query.data ?? null;
    },
  };
}
