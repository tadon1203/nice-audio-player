import { useEffect } from "react";
import {
  isActivePlayback,
  playbackController,
  usePlaybackStore,
} from "@/renderer/entities/playback";
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
 *
 * Playback state is read from the store when a key is pressed, never subscribed to: the app
 * shell mounts this, and a subscription would re-render the whole shell on every position tick.
 */
export function usePlaybackShortcuts() {
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

      const { snapshot, positionMs, durationMs } = usePlaybackStore.getState();

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!isActivePlayback(snapshot)) return;
        if (event.ctrlKey) {
          event.preventDefault();
          void (event.key === "ArrowLeft"
            ? playbackController.previous()
            : playbackController.next());
          return;
        }
        const next = nextSeekPosition(event.key, positionMs, durationMs ?? 0);
        if (next === null) return;
        event.preventDefault();
        void playbackController.seek(next);
        return;
      }

      if (event.key === " " || event.code === "Space") {
        if (isInteractiveTarget(event.target)) return;
        if (!isActivePlayback(snapshot)) return;
        event.preventDefault();
        void (snapshot.status === "playing"
          ? playbackController.pause()
          : playbackController.resume());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleNowPlaying, toggleQueue]);
}
