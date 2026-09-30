import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { MotionValue } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import type { AudioOutputSelection, PlaybackRepeatMode } from "@/shared/ipc";
import type { ClockJump } from "../lib/playback-clock-model";
import { playbackClock } from "./playback-clock";
import { isActivePlayback, playbackController, usePlaybackStore } from "./playback-session";

/*
 * Playback state is read through several small hooks, one per rate of change, so a component
 * re-renders only for what it shows. `usePlaybackPosition` changes about four times a second:
 * it is for components that print a time. Anything that draws the position (a fill, a ring,
 * lyric progress) reads `usePlaybackClock` instead, which advances every frame and re-renders
 * nothing.
 */

const playbackActions = {
  startPlayback: playbackController.startPlayback,
  pause: playbackController.pause,
  resume: playbackController.resume,
  previous: playbackController.previous,
  next: playbackController.next,
  seek: playbackController.seek,
  setVolume: playbackController.setVolume,
  toggleMute: playbackController.toggleMute,
  setShuffle: playbackController.setShuffle,
  setRepeatMode: playbackController.setRepeatMode,
  setOutputSelection: playbackController.setOutputSelection,
  removeQueueItem: playbackController.removeQueueItem,
  moveQueueItem: playbackController.moveQueueItem,
  clearQueue: playbackController.clearQueue,
  playQueueItem: playbackController.playQueueItem,
  enqueueTrack: playbackController.enqueueTrack,
} as const;

/** Stable; never causes a re-render. */
export function usePlaybackActions() {
  return playbackActions;
}

/** The loaded track, or the last one that played. Changes only when the track does. */
export function usePlaybackItem() {
  return usePlaybackStore((state) => state.item);
}

/** Which way the last track change went, for sliding the identity in the same direction. */
export function usePlaybackNavigation() {
  return usePlaybackStore((state) => state.lastNavigation);
}

/** Elapsed and total time of the loaded track, for printing. Updates about four times a second. */
export function usePlaybackPosition() {
  return usePlaybackStore(
    useShallow((state) => ({ positionMs: state.positionMs, durationMs: state.durationMs })),
  );
}

/** Length of the loaded track (null when unknown). Changes only with the track. */
export function usePlaybackDuration() {
  return usePlaybackStore((state) => state.durationMs);
}

/** What the transport controls need: state, availability, and in-flight commands. */
export function usePlaybackTransport() {
  return usePlaybackStore(
    useShallow((state) => {
      const snapshot = state.snapshot;
      return {
        status: snapshot?.status ?? ("stopped" as const),
        active: isActivePlayback(snapshot),
        canGoPrevious: snapshot?.base.canGoPrevious ?? false,
        canGoNext: snapshot?.base.canGoNext ?? false,
        connection: state.connection,
        pending: state.transportPending,
        seekPending: state.seekPending,
        commandError: state.error,
      };
    }),
  );
}

const SYSTEM_DEFAULT: AudioOutputSelection = { kind: "systemDefault" };

/** Volume, mute, and the chosen output device. */
export function usePlaybackOutput() {
  const state = usePlaybackStore(
    useShallow((current) => {
      const base = current.snapshot?.base;
      const selection = base?.outputSelection;
      return {
        volume: current.volumePreview ?? base?.volume ?? 1,
        muted: base?.muted ?? false,
        mutePending: current.mutePending,
        deviceId: selection?.kind === "device" ? selection.deviceId : null,
      };
    }),
  );
  const { deviceId, ...rest } = state;
  const outputSelection = useMemo<AudioOutputSelection>(
    () => (deviceId === null ? SYSTEM_DEFAULT : { kind: "device", deviceId }),
    [deviceId],
  );
  return { ...rest, outputSelection };
}

export function usePlaybackQueue() {
  const queue = usePlaybackStore((state) => state.queue);
  return {
    queue,
    repeatMode: queue?.repeatMode ?? ("off" as PlaybackRepeatMode),
    shuffleEnabled: queue?.shuffleEnabled ?? false,
  };
}

/** Which library track is loaded and whether it is playing, for highlighting track rows. */
export function useTrackPlaybackState() {
  return usePlaybackStore(
    useShallow((state) => ({
      activeTrackId: state.item?.trackId ?? null,
      playbackStatus: state.snapshot?.status ?? ("stopped" as const),
    })),
  );
}

/**
 * The playback position in milliseconds as a motion value that moves every frame while the
 * track plays. Bind it to styles (`useTransform`); do not read it into state. The frame loop
 * runs only while some component holds this hook (with `active`, the default).
 */
export function usePlaybackClock(active = true): MotionValue<number> {
  useEffect(() => (active ? playbackClock.retain() : undefined), [active]);
  return playbackClock.position;
}

/**
 * The latest jump of the position (a seek that completed, a new track), or null before any.
 * It changes exactly when one happens, so a component can react to the jump in the same render
 * that shows the new position.
 */
export function usePlaybackJump(): ClockJump | null {
  return useSyncExternalStore(playbackClock.onJump, playbackClock.lastJump);
}
