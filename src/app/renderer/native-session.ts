import { useEffect, useRef } from "react";
import { libraryQueryKeys } from "@/renderer/entities/library";
import { playbackController } from "@/renderer/features/playback-control";
import { getElectronApiOrNull } from "@/renderer/shared/lib/electron";
import { queryClient } from "./providers";

/** Owns the renderer's single subscription to push events from Preload. */
export function NativeSession() {
  const previousScanState = useRef<string | null>(null);

  useEffect(() => {
    const api = getElectronApiOrNull();
    if (api === null) return;

    void playbackController.initialize(api);
    return api.onEvent((event) => {
      playbackController.acceptEvent(event);

      if (event.event !== "libraryScanStateChanged") return;
      const previous = previousScanState.current;
      previousScanState.current = event.payload.state;
      queryClient.setQueryData(libraryQueryKeys.scan, event.payload);
      const terminal = ["completed", "cancelled", "failed"].includes(event.payload.state);
      if (terminal && previous !== event.payload.state) {
        void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.data });
      }
    });
  }, []);

  return null;
}
