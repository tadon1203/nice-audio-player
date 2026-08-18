import { useCallback, useEffect, useRef, useState } from "react";

import { isSeekAudioPlaybackError, seekAudioPlayback } from "@/api/audio-files";
import type { PlaybackSnapshot } from "@/bindings";

import type { PlaybackConnectionState, PlaybackUiAction } from "../lib/playback-state";

type SeekInteraction =
  | { kind: "idle" }
  | { kind: "scrubbing"; positionMs: number }
  | { kind: "pending"; positionMs: number };

/** A frontend-only receipt for a seek accepted by authoritative playback. */
export interface AcceptedPlaybackSeek {
  id: number;
  playbackId: string;
  acceptedRevision: number;
  positionMs: number;
}

interface UseSeekControllerOptions {
  playback: PlaybackSnapshot;
  connection: PlaybackConnectionState;
  isTransportCommandPending: boolean;
  isOutputSelectionPending: boolean;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  refreshAuthoritativeSnapshot: () => Promise<void>;
  dispatchPlaybackUi: (action: PlaybackUiAction) => void;
}

export function useSeekController({
  playback,
  connection,
  isTransportCommandPending,
  isOutputSelectionPending,
  applySnapshot,
  refreshAuthoritativeSnapshot,
  dispatchPlaybackUi,
}: UseSeekControllerOptions) {
  const [interaction, setInteraction] = useState<SeekInteraction>({ kind: "idle" });
  const pendingRef = useRef(false);
  const acceptedSeekId = useRef(0);
  const playbackRef = useRef(playback);
  const connectionRef = useRef(connection);
  const transportPendingRef = useRef(isTransportCommandPending);
  const outputSelectionPendingRef = useRef(isOutputSelectionPending);

  useEffect(() => {
    playbackRef.current = playback;
    connectionRef.current = connection;
    transportPendingRef.current = isTransportCommandPending;
    outputSelectionPendingRef.current = isOutputSelectionPending;
  }, [connection, isOutputSelectionPending, isTransportCommandPending, playback]);

  const updateSeek = useCallback((value: number) => {
    setInteraction({ kind: "scrubbing", positionMs: value });
  }, []);

  const [acceptedSeek, setAcceptedSeek] = useState<AcceptedPlaybackSeek | null>(null);

  const requestSeek = useCallback(
    async (value: number): Promise<AcceptedPlaybackSeek | null> => {
      const current = playbackRef.current;
      if (
        (current.status !== "playing" && current.status !== "paused") ||
        current.durationMs === null ||
        transportPendingRef.current ||
        outputSelectionPendingRef.current ||
        pendingRef.current ||
        connectionRef.current !== "ready"
      ) {
        setInteraction({ kind: "idle" });
        return null;
      }

      const target = Math.max(0, Math.min(value, current.durationMs));
      setInteraction({ kind: "pending", positionMs: target });
      pendingRef.current = true;
      dispatchPlaybackUi({ type: "commandStarted", lane: "seek" });
      try {
        const snapshot = await seekAudioPlayback(target);
        applySnapshot(snapshot);
        if (
          (snapshot.status === "playing" || snapshot.status === "paused") &&
          snapshot.playbackId === current.playbackId
        ) {
          const receipt = {
            id: ++acceptedSeekId.current,
            playbackId: snapshot.playbackId,
            acceptedRevision: snapshot.revision,
            positionMs: snapshot.positionMs,
          };
          setAcceptedSeek(receipt);
          dispatchPlaybackUi({ type: "commandSucceeded", lane: "seek" });
          return receipt;
        }
        dispatchPlaybackUi({ type: "commandSucceeded", lane: "seek" });
        return null;
      } catch (error: unknown) {
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "seek",
          message: isSeekAudioPlaybackError(error)
            ? "The playback position could not be changed."
            : "An unexpected playback error occurred.",
        });
        await refreshAuthoritativeSnapshot();
        return null;
      } finally {
        pendingRef.current = false;
        setInteraction({ kind: "idle" });
      }
    },
    [applySnapshot, dispatchPlaybackUi, refreshAuthoritativeSnapshot],
  );

  const cancelSeek = useCallback(() => {
    setInteraction((current) => (current.kind === "scrubbing" ? { kind: "idle" } : current));
  }, []);

  return {
    canSeek:
      (playback.status === "playing" || playback.status === "paused") &&
      playback.durationMs !== null &&
      connection === "ready" &&
      !isTransportCommandPending &&
      !isOutputSelectionPending &&
      interaction.kind !== "pending",
    seekPreviewMs: interaction.kind === "idle" ? null : interaction.positionMs,
    isSeekPending: interaction.kind === "pending",
    acceptedSeek,
    onSeek: updateSeek,
    requestSeek,
    onSeekCancel: cancelSeek,
  };
}
