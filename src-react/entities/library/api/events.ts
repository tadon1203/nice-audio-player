import type { QueryClient } from "@tanstack/react-query";
import type { AppEvent, LibraryScanSnapshot, LibraryScanState } from "@/shared/ipc";
import { libraryQueryKeys } from "./queries";

const terminalScanStates: readonly LibraryScanState[] = ["completed", "cancelled", "failed"];

/**
 * Mirrors backend library events into the query cache: scan snapshots replace the
 * cached scan state, and a scan reaching a new terminal state invalidates catalog data.
 */
export function applyLibraryEvent(client: QueryClient, event: AppEvent) {
  if (event.event !== "libraryScanStateChanged") return;

  const previous = client.getQueryData<LibraryScanSnapshot>(libraryQueryKeys.scan)?.state;
  const next = event.payload.state;
  client.setQueryData(libraryQueryKeys.scan, event.payload);
  if (terminalScanStates.includes(next) && previous !== next) {
    void client.invalidateQueries({ queryKey: libraryQueryKeys.data });
  }
}
