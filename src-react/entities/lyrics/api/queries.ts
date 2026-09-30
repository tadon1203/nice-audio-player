import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { nativeApi } from "@/shared/lib/native";

export const lyricsQueryKeys = {
  all: ["lyrics"] as const,
  track: (trackId: string | null) => ["lyrics", trackId] as const,
};

export const lyricsQueryOptions = {
  track: (trackId: string | null) =>
    queryOptions({
      queryKey: lyricsQueryKeys.track(trackId),
      queryFn: trackId === null ? skipToken : () => nativeApi().getTrackLyrics(trackId),
      // Lyrics come from local files, so they stay fresh until a library scan finishes
      // (`applyLyricsEvent`), which is when an added or edited .lrc file can be noticed.
      staleTime: Infinity,
      gcTime: Infinity,
    }),
};

export function useTrackLyrics(trackId: string | null) {
  return useQuery(lyricsQueryOptions.track(trackId));
}
