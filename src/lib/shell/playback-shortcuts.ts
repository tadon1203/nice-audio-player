import type { Playback } from "$lib/playback/playback.svelte";
import { nextRepeatMode } from "$lib/playback/snapshot";
import { stepVolumeDb } from "$lib/playback/volume-step";
import { nextSeekPosition } from "$lib/ui/waveform/waveform-model";
import { nowPlaying } from "./now-playing.svelte";
import { queuePanel } from "./queue-panel.svelte";

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
 * Global playback shortcuts (requirements.md, Keyboard): hand every `keydown` on the window to
 * this. It skips editable targets and anything the focused element (or the seek bar's own local
 * arrow-key seek) already handled via `defaultPrevented`.
 *
 * Playback state is read when a key is pressed, never subscribed to.
 */
export function handlePlaybackShortcut(event: KeyboardEvent, playback: Playback): void {
  if (event.defaultPrevented || isEditableTarget(event.target)) return;

  if (event.key === "l" && event.ctrlKey) {
    event.preventDefault();
    // Like the dock button, it has nothing to open without a track (closing always works).
    if (playback.active || nowPlaying.isOpen) nowPlaying.toggle();
    return;
  }

  if (event.key === "Escape" && !event.ctrlKey && !event.altKey && nowPlaying.isOpen) {
    // The queue panel and menus are above Now Playing and close first (they handle Escape).
    if (queuePanel.isOpen) return;
    event.preventDefault();
    nowPlaying.close();
    return;
  }

  if ((event.key === "/" && !event.ctrlKey) || (event.key === "f" && event.ctrlKey)) {
    const filter = document.querySelector<HTMLInputElement>("[data-library-filter]");
    if (filter === null || nowPlaying.isOpen) return;
    event.preventDefault();
    filter.focus();
    filter.select();
    return;
  }

  if (event.key === "q" && event.ctrlKey) {
    event.preventDefault();
    queuePanel.toggle();
    return;
  }

  const key = event.key.toLowerCase();
  if (event.ctrlKey && !event.shiftKey && !event.altKey && (key === "s" || key === "r")) {
    const queue = playback.queue;
    // Also keeps the web view from saving or reloading the page.
    event.preventDefault();
    if (queue === null) return;
    void (key === "s"
      ? playback.setShuffle(!queue.shuffleEnabled)
      : playback.setRepeatMode(nextRepeatMode(queue.repeatMode)));
    return;
  }

  const { snapshot, durationMs } = playback;

  if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.ctrlKey) {
    if (snapshot === null) return;
    event.preventDefault();
    playback.changeVolume(stepVolumeDb(playback.volume, event.key === "ArrowUp" ? 1 : -1));
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (!playback.active) return;
    if (event.ctrlKey) {
      event.preventDefault();
      void (event.key === "ArrowLeft" ? playback.previous() : playback.next());
      return;
    }
    // Holding the key continues from the seek still waiting to be sent, not the stale position;
    // otherwise from where the clock is now.
    const from = playback.pendingSeekMs() ?? playback.clock.estimate();
    const next = nextSeekPosition(event.key, from, durationMs ?? 0);
    if (next === null) return;
    event.preventDefault();
    void playback.seek(next);
    return;
  }

  if (event.key === " " || event.code === "Space") {
    if (isInteractiveTarget(event.target)) return;
    if (!playback.active) return;
    event.preventDefault();
    void (playback.status === "playing" ? playback.pause() : playback.resume());
  }
}
