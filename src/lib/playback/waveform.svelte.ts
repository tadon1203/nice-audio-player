import { createQuery } from "@tanstack/svelte-query";
import { waveformQueryOptions } from "./waveform";

/** The waveform of the file at `path`, or `null` until the backend has analyzed it. */
export function createPlaybackWaveform(path: () => string | null) {
  const query = createQuery(() => waveformQueryOptions(path()));
  return {
    get current() {
      return query.data ?? null;
    },
  };
}
