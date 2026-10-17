<script lang="ts">
  import { useQueryClient } from "@tanstack/svelte-query";
  import { AppServices } from "#lib/shell/app-services.svelte";

  /**
   * Fetches the lyrics of the playing track and the next one ahead of time, so Now Playing knows
   * whether there are any before it opens (its layout depends on it) and a track change does not
   * wait on the file.
   */
  const queryClient = useQueryClient();
  const { playback, lyrics } = AppServices.current();
  const currentId = $derived(playback.item?.id ?? null);
  const nextId = $derived(playback.queue?.upcoming[0]?.id ?? null);

  $effect(() => {
    for (const trackId of [currentId, nextId]) {
      if (trackId !== null) void queryClient.prefetchQuery(lyrics.trackOptions(trackId));
    }
  });
</script>
