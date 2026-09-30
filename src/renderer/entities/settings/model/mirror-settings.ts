import type { AppEvent, Settings, TNativeAPI } from "@/shared/ipc";
import { mirrorArtworkBackdrop } from "@/renderer/shared/lib/artwork-backdrop";
import { mirrorCalmMotion } from "@/renderer/shared/lib/calm-motion";

const LEGACY_BACKDROP_KEY = "nice-audio-player:artwork-backdrop";

/** Settings arrive with every field optional (the backend fills defaults), so read them defensively. */
export function mirrorSettings(settings: Settings) {
  mirrorArtworkBackdrop(settings.appearance?.artworkBackdrop ?? true);
  mirrorCalmMotion(settings.appearance?.calmMotion ?? false);
}

export function mirrorSettingsEvent(event: AppEvent) {
  if (event.event === "settingsChanged") mirrorSettings(event.payload);
}

/**
 * Loads the saved settings. The backdrop preference used to live in the webview's local storage;
 * a legacy "off" is moved to the backend once, then forgotten.
 */
export async function loadSettings(api: TNativeAPI) {
  let settings = await api.getSettings();
  try {
    if (window.localStorage.getItem(LEGACY_BACKDROP_KEY) === "off") {
      settings = await api.updateSettings({
        appearance: { artworkBackdrop: false, calmMotion: null },
      });
    }
    window.localStorage.removeItem(LEGACY_BACKDROP_KEY);
  } catch {
    // Local storage may be unavailable; the backend's value stands.
  }
  mirrorSettings(settings);
}
