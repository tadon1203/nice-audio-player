import { useEffect, useRef, useState } from "react";
import {
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  nextAudioPlayback,
  pauseAudioPlayback,
  previousAudioPlayback,
  resumeAudioPlayback,
  stopAudioPlayback,
} from "@/api/audio-files";
import {
  isStartLibraryAlbumError,
  isStartLibraryAlbumTrackError,
  isStartLibraryTrackError,
  startLibraryAlbum,
  startLibraryAlbumTrack,
  startLibraryTrack,
} from "@/api/library";
import type { LibraryAlbumKey, PlaybackSnapshot } from "@/bindings";
import type { PlaybackConnectionState, PlaybackUiAction } from "@/lib/playback-state";
import { diagnostics } from "@/lib/diagnostics";

export type TransportOperation =
  | { type: "stop" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "startTrack"; trackId: string }
  | { type: "startAlbum"; albumKey: LibraryAlbumKey }
  | { type: "startAlbumTrack"; albumKey: LibraryAlbumKey; trackId: string }
  | { type: "previous" }
  | { type: "next" };
export type PendingTransportCommand = "stop" | "pause" | "resume" | "previous" | "next" | null;

export function useTransportController({
  playback,
  connection,
  applySnapshot,
  refreshAuthoritativeSnapshot,
  dispatchPlaybackUi,
}: {
  playback: PlaybackSnapshot;
  connection: PlaybackConnectionState;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  refreshAuthoritativeSnapshot: () => Promise<void>;
  dispatchPlaybackUi: (action: PlaybackUiAction) => void;
}) {
  const [pendingTransportCommand, setPendingTransportCommand] =
    useState<PendingTransportCommand>(null);
  const playbackRef = useRef(playback);
  const connectionRef = useRef(connection);
  const busyRef = useRef(false);
  const queuedRef = useRef<TransportOperation | null>(null);
  const generationRef = useRef(0);
  const supersededRef = useRef<number | null>(null);
  useEffect(() => {
    playbackRef.current = playback;
    connectionRef.current = connection;
  }, [connection, playback]);
  async function requestTransport(operation: TransportOperation): Promise<void> {
    if (busyRef.current) {
      queuedRef.current = operation;
      if (
        operation.type === "startTrack" ||
        operation.type === "startAlbum" ||
        operation.type === "startAlbumTrack"
      ) {
        supersededRef.current = generationRef.current;
        void stopAudioPlayback().catch(() => undefined);
      }
      return;
    }
    if (connectionRef.current !== "ready") return;
    const current = playbackRef.current;
    const valid =
      operation.type.startsWith("start") ||
      (operation.type === "previous" && current.canGoPrevious) ||
      (operation.type === "next" && current.canGoNext) ||
      (operation.type === "stop" &&
        (current.status === "playing" || current.status === "paused")) ||
      (operation.type === "pause" && current.status === "playing") ||
      (operation.type === "resume" && current.status === "paused");
    if (!valid) return;
    busyRef.current = true;
    const generation = ++generationRef.current;
    setPendingTransportCommand(
      operation.type.startsWith("start") ? "resume" : (operation.type as PendingTransportCommand),
    );
    try {
      const snapshot =
        operation.type === "startTrack"
          ? await startLibraryTrack(operation.trackId)
          : operation.type === "startAlbum"
            ? await startLibraryAlbum(operation.albumKey)
            : operation.type === "startAlbumTrack"
              ? await startLibraryAlbumTrack(operation.albumKey, operation.trackId)
              : operation.type === "previous"
                ? await previousAudioPlayback()
                : operation.type === "next"
                  ? await nextAudioPlayback()
                  : operation.type === "stop"
                    ? await stopAudioPlayback()
                    : operation.type === "pause"
                      ? await pauseAudioPlayback()
                      : await resumeAudioPlayback();
      if (supersededRef.current !== generation) {
        applySnapshot(snapshot);
        dispatchPlaybackUi({ type: "commandSucceeded", lane: "transport" });
      }
    } catch (error) {
      if (supersededRef.current !== generation) {
        diagnostics.warn("frontend.playback.transport_failed", {
          cause: error,
          context: { operation: operation.type, revision: current.revision },
        });
        const message =
          operation.type === "startTrack" &&
          isStartLibraryTrackError(error) &&
          error.code === "trackUnavailable"
            ? "This track is no longer available."
            : operation.type === "startAlbum" &&
                isStartLibraryAlbumError(error) &&
                error.code === "noPlayableTracks"
              ? "This album has no playable tracks."
              : operation.type === "startAlbumTrack" &&
                  isStartLibraryAlbumTrackError(error) &&
                  error.code === "trackUnavailable"
                ? "This track is no longer available in this album."
                : operation.type === "pause" && isPauseAudioPlaybackError(error)
                  ? "Playback cannot be paused in its current state."
                  : operation.type === "resume" && isResumeAudioPlaybackError(error)
                    ? "Playback cannot be resumed in its current state."
                    : "The playback service is unavailable.";
        dispatchPlaybackUi({ type: "commandFailed", lane: "transport", message });
        await refreshAuthoritativeSnapshot();
      }
    } finally {
      busyRef.current = false;
      setPendingTransportCommand(null);
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued) void requestTransport(queued);
    }
  }
  return {
    pendingTransportCommand,
    isTransportCommandPending: pendingTransportCommand !== null,
    requestTransport,
  };
}
