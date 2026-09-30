import { create } from "zustand";
import { getNativeApiOrNull } from "./native";

type CalmMotionState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

/**
 * The `Calm motion` preference, mirrored from the backend's settings like the artwork backdrop.
 * Off by default. Changing it applies at once and is saved by the backend.
 */
export const useCalmMotion = create<CalmMotionState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => {
    set({ enabled });
    void getNativeApiOrNull()
      ?.updateSettings({ appearance: { artworkBackdrop: null, calmMotion: enabled } })
      .catch(() => undefined);
  },
}));

/** Applies the value the backend holds, without writing it back. */
export function mirrorCalmMotion(enabled: boolean) {
  useCalmMotion.setState({ enabled });
}
