import { useEffect } from "react";
import { isActivePlayback, usePlaybackSession } from "@/renderer/features/playback-control";
import { nextSeekPosition } from "@/renderer/widgets/playback-region";
import { useNowPlaying } from "@/renderer/widgets/now-playing";
import { useQueuePanel } from "@/renderer/widgets/queue-panel";

const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    INTERACTIVE_TAGS.has(target.tagName) || target.closest("button, a, [role='button']") !== null
  );
}

/**
 * Global playback shortcuts (DESIGN.md's Keyboard table). Mounted once. Skips editable
 * targets and anything the focused element (or `WaveformSeek`'s own local arrow-key seek)
 * already handled via `defaultPrevented`.
 */
export function usePlaybackShortcuts() {
  const playback = usePlaybackSession();
  const { toggle: toggleNowPlaying } = useNowPlaying();
  const { toggle: toggleQueue } = useQueuePanel();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      if (event.key === "l" && event.ctrlKey) {
        event.preventDefault();
        toggleNowPlaying();
        return;
      }

      if (event.key === "q" && event.ctrlKey) {
        event.preventDefault();
        toggleQueue();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (event.ctrlKey) {
          const active = isActivePlayback(playback.snapshot);
          if (!active) return;
          event.preventDefault();
          void (event.key === "ArrowLeft" ? playback.previous() : playback.next());
          return;
        }
        const active = isActivePlayback(playback.snapshot);
        if (!active) return;
        const next = nextSeekPosition(event.key, playback.positionMs, playback.durationMs ?? 0);
        if (next === null) return;
        event.preventDefault();
        void playback.seek(next);
        return;
      }

      if (event.key === " " || event.code === "Space") {
        if (isInteractiveTarget(event.target)) return;
        if (!isActivePlayback(playback.snapshot)) return;
        event.preventDefault();
        void (playback.snapshot.status === "playing" ? playback.pause() : playback.resume());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playback, toggleNowPlaying, toggleQueue]);
}
