import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { nativeApi } from "@/renderer/shared/lib/native";

export const lyricsQueryKeys = {
  track: (trackId: string | null) => ["lyrics", trackId] as const,
};

export const lyricsQueryOptions = {
  track: (trackId: string | null) =>
    queryOptions({
      queryKey: lyricsQueryKeys.track(trackId),
      queryFn: trackId === null ? skipToken : () => nativeApi().getTrackLyrics(trackId),
      // Lyrics come from local files; a rescan or file edit is not observed until restart.
      staleTime: Infinity,
      gcTime: Infinity,
    }),
};

export function useTrackLyrics(trackId: string | null) {
  return useQuery(lyricsQueryOptions.track(trackId));
}
