<script lang="ts">
  import { useQueryClient } from "@tanstack/svelte-query";
  import { lyricsQueryOptions } from "$lib/lyrics/queries";
  import { getPlayback } from "$lib/playback/context";

  /**
   * Fetches the lyrics of the playing track and the next one ahead of time, so Now Playing knows
   * whether there are any before it opens (its layout depends on it) and a track change does not
   * wait on the file.
   */
  const queryClient = useQueryClient();
  const playback = getPlayback();
  const currentId = $derived(playback.item?.trackId ?? null);
  const nextId = $derived(playback.queue?.upcoming[0]?.trackId ?? null);

  $effect(() => {
    for (const trackId of [currentId, nextId]) {
      if (trackId !== null) void queryClient.prefetchQuery(lyricsQueryOptions.track(trackId));
    }
  });
</script>
