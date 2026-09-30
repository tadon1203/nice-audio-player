import { createQuery } from "@tanstack/svelte-query";
import { lyricsQueryOptions } from "./queries";

export function createTrackLyrics(trackId: () => string | null) {
  return createQuery(() => lyricsQueryOptions.track(trackId()));
}
