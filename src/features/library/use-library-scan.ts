import { useEffect, useState } from "react";
import { getLibraryScanState, listenToLibraryScanProgress } from "@/api/library";
import type { LibraryScanSnapshot } from "@/bindings";
import { diagnostics } from "@/lib/diagnostics";

export function useLibraryScan() {
  const [snapshot, setSnapshot] = useState<LibraryScanSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const stopListening = await listenToLibraryScanProgress(
          (next) => {
            if (!active) return;
            receivedEvent = true;
            if (["completed", "cancelled", "failed"].includes(next.state))
              setLibraryRefreshKey((key) => key + 1);
            setSnapshot(next);
          },
          () => {
            diagnostics.warn("frontend.library.scan_subscription_failed");
            setError("Library scan updates could not be read.");
          },
        );
        if (!active) {
          stopListening();
          return;
        }
        unsubscribe = stopListening;
        const initial = await getLibraryScanState();
        if (active && !receivedEvent) {
          setSnapshot(initial);
        }
      } catch (cause) {
        diagnostics.error("frontend.library.scan_sync_failed", { cause });
        if (active && !receivedEvent) setError("Library scan state could not be loaded.");
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  return { snapshot, error, libraryRefreshKey };
}
