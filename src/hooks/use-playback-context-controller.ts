import { useCallback, useRef, useState } from "react";

export type PlaybackContextMode = "queue" | "lyrics";
export function usePlaybackContextController() {
  const [mode, setMode] = useState<PlaybackContextMode | null>(null);
  const queueTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lyricsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const open = useCallback((next: PlaybackContextMode) => setMode(next), []);
  const toggle = useCallback((next: PlaybackContextMode) => {
    setMode((current) => (current === next ? null : next));
  }, []);
  const close = useCallback((restoreFocus = true) => {
    setMode((current) => {
      if (restoreFocus) {
        const trigger = current === "queue" ? queueTriggerRef.current : lyricsTriggerRef.current;
        trigger?.focus({ preventScroll: true });
      }
      return null;
    });
  }, []);
  return {
    mode,
    isOpen: mode !== null,
    open,
    toggle,
    close,
    queueTriggerRef,
    lyricsTriggerRef,
  };
}
