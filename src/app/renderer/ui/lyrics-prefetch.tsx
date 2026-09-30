import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lyricsQueryOptions } from "@/renderer/entities/lyrics";
import { usePlaybackItem, usePlaybackQueue } from "@/renderer/entities/playback";

/**
 * Fetches the lyrics of the playing track and the next one ahead of time, so Now Playing knows
 * whether there are any before it opens (its layout depends on it) and a track change does not
 * wait on the file.
 */
export function LyricsPrefetch() {
  const queryClient = useQueryClient();
  const currentId = usePlaybackItem()?.trackId ?? null;
  const nextId = usePlaybackQueue().queue?.upcoming[0]?.trackId ?? null;

  useEffect(() => {
    for (const trackId of [currentId, nextId]) {
      if (trackId !== null) void queryClient.prefetchQuery(lyricsQueryOptions.track(trackId));
    }
  }, [queryClient, currentId, nextId]);

  return null;
}
