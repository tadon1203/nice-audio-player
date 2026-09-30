import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  isActivePlayback,
  nextRepeatMode,
  playbackController,
  stepVolumeDb,
  usePlaybackStore,
} from "@/renderer/entities/playback";
import { useNowPlaying } from "@/renderer/features/now-playing-transition";
import { nextSeekPosition } from "@/renderer/shared/ui/waveform";
import { useQueuePanel, useQueuePanelStore } from "@/renderer/widgets/queue-panel";

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
 * Global playback shortcuts (requirements.md, Keyboard). Mounted once. Skips editable
 * targets and anything the focused element (or `WaveformSeek`'s own local arrow-key seek)
 * already handled via `defaultPrevented`.
 *
 * Playback state is read from the store when a key is pressed, never subscribed to: the app
 * shell mounts this, and a subscription would re-render the whole shell on every position tick.
 */
export function usePlaybackShortcuts() {
  const { toggle: toggleNowPlaying, close: closeNowPlaying } = useNowPlaying();
  const router = useRouter();
  const { toggle: toggleQueue } = useQueuePanel();
  const isNowPlayingOpen = () => router.state.location.state.nowPlaying === true;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      if (event.key === "l" && event.ctrlKey) {
        event.preventDefault();
        // Like the dock button, it has nothing to open without a track (closing always works).
        if (isActivePlayback(usePlaybackStore.getState().snapshot) || isNowPlayingOpen()) {
          toggleNowPlaying();
        }
        return;
      }

      if (event.key === "Escape" && !event.ctrlKey && !event.altKey && isNowPlayingOpen()) {
        // The queue panel and menus are above Now Playing and close first (they handle Escape).
        if (useQueuePanelStore.getState().isOpen) return;
        event.preventDefault();
        closeNowPlaying();
        return;
      }

      if ((event.key === "/" && !event.ctrlKey) || (event.key === "f" && event.ctrlKey)) {
        const filter = document.querySelector<HTMLInputElement>("[data-library-filter]");
        if (filter === null || isNowPlayingOpen()) return;
        event.preventDefault();
        filter.focus();
        filter.select();
        return;
      }

      if (event.key === "q" && event.ctrlKey) {
        event.preventDefault();
        toggleQueue();
        return;
      }

      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key.toLowerCase() === "s" || event.key.toLowerCase() === "r")
      ) {
        const queue = usePlaybackStore.getState().queue;
        // Also keeps the web view from saving or reloading the page.
        event.preventDefault();
        if (queue === null) return;
        void (event.key.toLowerCase() === "s"
          ? playbackController.setShuffle(!queue.shuffleEnabled)
          : playbackController.setRepeatMode(nextRepeatMode(queue.repeatMode)));
        return;
      }

      const { snapshot, positionMs, durationMs } = usePlaybackStore.getState();

      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.ctrlKey) {
        const base = snapshot?.base;
        if (base === undefined) return;
        event.preventDefault();
        const volume = usePlaybackStore.getState().volumePreview ?? base.volume;
        playbackController.setVolume(stepVolumeDb(volume, event.key === "ArrowUp" ? 1 : -1));
        if (base.muted) void playbackController.toggleMute();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!isActivePlayback(snapshot)) return;
        if (event.ctrlKey) {
          event.preventDefault();
          void (event.key === "ArrowLeft"
            ? playbackController.previous()
            : playbackController.next());
          return;
        }
        // Holding the key continues from the seek still waiting to be sent, not the stale position.
        const from = playbackController.pendingSeekMs() ?? positionMs;
        const next = nextSeekPosition(event.key, from, durationMs ?? 0);
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
  }, [toggleNowPlaying, closeNowPlaying, toggleQueue, router]);
}
