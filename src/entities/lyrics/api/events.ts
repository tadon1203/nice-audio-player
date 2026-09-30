import type { QueryClient } from "@tanstack/react-query";
import type { AppEvent } from "@/shared/ipc";
import { lyricsQueryKeys } from "./queries";

/** A finished scan may have found new or edited lyrics files, so cached lyrics are refetched. */
export function applyLyricsEvent(client: QueryClient, event: AppEvent) {
  if (event.event !== "libraryScanStateChanged") return;
  if (event.payload.state === "running" || event.payload.state === "idle") return;
  void client.invalidateQueries({ queryKey: lyricsQueryKeys.all });
}
