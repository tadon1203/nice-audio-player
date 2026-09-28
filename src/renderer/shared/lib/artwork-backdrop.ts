import { create } from "zustand";
import { getNativeApiOrNull } from "./native";

type ArtworkBackdropState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

/**
 * The `Artwork backdrop` preference, mirrored from the backend's settings (`entities/settings`
 * keeps it in sync). On by default. Changing it applies at once and is saved by the backend.
 */
export const useArtworkBackdrop = create<ArtworkBackdropState>((set) => ({
  enabled: true,
  setEnabled: (enabled) => {
    set({ enabled });
    void getNativeApiOrNull()
      ?.updateSettings({ appearance: { artworkBackdrop: enabled } })
      .catch(() => undefined);
  },
}));

/** Applies the value the backend holds, without writing it back. */
export function mirrorArtworkBackdrop(enabled: boolean) {
  useArtworkBackdrop.setState({ enabled });
}
