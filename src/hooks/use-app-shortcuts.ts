import { useEffect } from "react";
import type { PlaybackContextMode } from "./use-playback-context-controller";

export function useAppShortcuts({
  contextMode,
  onCloseContext,
  onToggleContext,
  onTogglePlayback,
}: {
  contextMode: PlaybackContextMode | null;
  onCloseContext: () => void;
  onToggleContext: (mode: PlaybackContextMode) => void;
  onTogglePlayback: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      if (
        element?.matches("input, textarea, select, [contenteditable='true']") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === "Escape" && contextMode) {
        event.preventDefault();
        onCloseContext();
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        onToggleContext("queue");
      } else if (event.key === " " && !element?.closest("[data-scroll-region]")) {
        event.preventDefault();
        onTogglePlayback();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMode, onCloseContext, onToggleContext, onTogglePlayback]);
}
