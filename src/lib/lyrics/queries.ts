import { queryOptions, skipToken } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";

export const lyricsQueryKeys = {
  all: ["lyrics"] as const,
  track: (trackId: string | null) => ["lyrics", trackId] as const,
};

export const lyricsQueryOptions = {
  track: (trackId: string | null) =>
    queryOptions({
      queryKey: lyricsQueryKeys.track(trackId),
      queryFn: trackId === null ? skipToken : () => requireNative().getTrackLyrics(trackId),
      // Lyrics come from local files, so they stay fresh until a library scan finishes
      // (`refreshLyrics`), which is when an added or edited .lrc file can be noticed.
      staleTime: Infinity,
      gcTime: Infinity,
    }),
};
