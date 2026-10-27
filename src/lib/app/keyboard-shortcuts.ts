import { PlaybackSnapshots } from "#lib/player/playback-snapshots";
import { VolumeStep } from "#lib/player/volume-step";
import { Waveform } from "#lib/components/ui/waveform/waveform";
import type { App } from "./app.svelte";

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
 * Handles one window `keydown` as a global playback shortcut (requirements.md, Keyboard). It skips
 * editable targets and anything the focused element (or the seek bar's own local arrow-key seek)
 * already handled via `defaultPrevented`. Each playback command runs through `app.ui.actions`, so its
 * failure is reported like a click's.
 *
 * Player state is read when a key is pressed, never subscribed to.
 */
export function handleShortcut(event: KeyboardEvent, app: App): void {
  if (event.defaultPrevented || isEditableTarget(event.target)) return;
  const playback = app.player;
  const {
    ui: { actions, nowPlaying },
  } = app;

  if (event.key === "l" && event.ctrlKey) {
    event.preventDefault();
    // Like the dock button, it has nothing to open without a track (closing always works).
    if (playback.isActive || nowPlaying.isOpen) nowPlaying.toggle();
    return;
  }

  if (event.key === "Escape" && !event.ctrlKey && !event.altKey && nowPlaying.isOpen) {
    // The queue panel and menus are above Now Playing and close first (they handle Escape).
    if (app.ui.queuePanelOpen) return;
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
    app.ui.queuePanelOpen = !app.ui.queuePanelOpen;
    return;
  }

  const key = event.key.toLowerCase();
  if (event.ctrlKey && !event.shiftKey && !event.altKey && (key === "s" || key === "r")) {
    const queue = playback.queue;
    // Also keeps the web view from saving or reloading the page.
    event.preventDefault();
    if (queue === null) return;
    actions.run(() =>
      key === "s"
        ? playback.setShuffle(!queue.shuffleEnabled)
        : playback.setRepeatMode(PlaybackSnapshots.nextRepeatMode(queue.repeatMode)),
    );
    return;
  }

  const { snapshot, durationMs } = playback;

  if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.ctrlKey) {
    if (snapshot === null) return;
    event.preventDefault();
    const volume = VolumeStep.step(playback.volume, event.key === "ArrowUp" ? 1 : -1);
    actions.run(() => playback.changeVolume(volume));
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (!playback.isActive) return;
    if (event.ctrlKey) {
      event.preventDefault();
      actions.run(() => (event.key === "ArrowLeft" ? playback.previous() : playback.next()));
      return;
    }
    // Holding the key continues from the seek still waiting to be sent, not the stale position;
    // otherwise from where the clock is now.
    const from = playback.pendingSeekMs() ?? playback.clock.estimate();
    const next = Waveform.nextSeekPosition(event.key, from, durationMs ?? 0);
    if (next === null) return;
    event.preventDefault();
    actions.run(() => playback.seek(next));
    return;
  }

  if (event.key === " " || event.code === "Space") {
    if (isInteractiveTarget(event.target)) return;
    if (!playback.isActive) return;
    event.preventDefault();
    actions.run(() => (playback.isPlaying ? playback.pause() : playback.resume()));
  }
}
