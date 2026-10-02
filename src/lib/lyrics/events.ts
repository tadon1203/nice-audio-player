import type { QueryClient } from "@tanstack/svelte-query";
import { lyricsQueryKeys } from "./queries";

/** A finished scan may have found new or edited lyrics files, so cached lyrics are refetched. */
export function refreshLyrics(client: QueryClient) {
  void client.invalidateQueries({ queryKey: lyricsQueryKeys.all });
}
