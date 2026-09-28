import { useEffect } from "react";
import { applyLibraryEvent } from "@/renderer/entities/library";
import { applyLyricsEvent } from "@/renderer/entities/lyrics";
import { loadSettings, mirrorSettingsEvent } from "@/renderer/entities/settings";
import { applyWaveformEvent, playbackController } from "@/renderer/features/playback-control";
import { getNativeApiOrNull } from "@/renderer/shared/lib/native";
import { queryClient } from "./query-client";

/** Owns the renderer's single subscription to backend push events. */
export function NativeSession() {
  useEffect(() => {
    const api = getNativeApiOrNull();
    if (api === null) return;

    void playbackController.initialize(api);
    void loadSettings(api).catch(() => undefined);
    return api.onEvent((event) => {
      playbackController.acceptEvent(event);
      applyLibraryEvent(queryClient, event);
      applyLyricsEvent(queryClient, event);
      applyWaveformEvent(queryClient, event);
      mirrorSettingsEvent(event);
    });
  }, []);

  return null;
}
