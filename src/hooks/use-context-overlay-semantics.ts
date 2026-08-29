import { useSyncExternalStore } from "react";

const contextOverlayQuery = "(max-width: 1439px)";

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(contextOverlayQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(contextOverlayQuery).matches;
}

/**
 * Reports the semantic interaction mode for an open context surface.
 * CSS remains the authority for the surface's final geometry.
 */
export function useContextOverlaySemantics() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
