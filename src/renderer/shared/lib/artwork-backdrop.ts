import { create } from "zustand";

const STORAGE_KEY = "nice-audio-player:artwork-backdrop";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

type ArtworkBackdropState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

/** The `Artwork backdrop` preference. On by default; a per-viewer convenience, not domain state. */
export const useArtworkBackdrop = create<ArtworkBackdropState>((set) => ({
  enabled: readStored(),
  setEnabled: (enabled) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // The preference still applies for this session.
    }
    set({ enabled });
  },
}));
