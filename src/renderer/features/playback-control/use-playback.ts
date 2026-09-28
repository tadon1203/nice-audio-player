import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AudioOutputSelection, PlaybackRepeatMode } from "@/shared/ipc";
import { isActivePlayback, playbackController, usePlaybackStore } from "./playback-session";

/*
 * Playback state is read through several small hooks, one per rate of change, so a component
 * re-renders only for what it shows. `usePlaybackPosition` is the only one that changes many
 * times a second; give it to the few components that draw a position and to no one else.
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
} as const;

/** Stable; never causes a re-render. */
export function usePlaybackActions() {
  return playbackActions;
}

/** The loaded track, or the last one that played. Changes only when the track does. */
export function usePlaybackItem() {
  return usePlaybackStore((state) => state.item);
}

/** Elapsed and total time of the loaded track. Updates about four times a second. */
export function usePlaybackPosition() {
  return usePlaybackStore(
    useShallow((state) => ({ positionMs: state.positionMs, durationMs: state.durationMs })),
  );
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
