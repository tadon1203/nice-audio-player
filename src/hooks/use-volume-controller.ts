import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPlaybackMuteError,
  isSetPlaybackVolumeError,
  muteAudioPlayback,
  setPlaybackVolume,
  unmuteAudioPlayback,
} from "@/api/audio-files";
import type { PlaybackSnapshot } from "@/bindings";
import type { PlaybackConnectionState, PlaybackUiAction } from "../lib/playback-state";

type VolumeInteraction =
  | { kind: "idle" }
  | { kind: "adjusting" | "settling"; value: number; startValue: number; startMuted: boolean };
type MuteIntent = { target: boolean; kind: "explicit" | "volumeInteraction" };

interface Options {
  playback: PlaybackSnapshot;
  connection: PlaybackConnectionState;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  refreshAuthoritativeSnapshot: () => Promise<void>;
  dispatchPlaybackUi: (action: PlaybackUiAction) => void;
}
function normalize(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function useVolumeController({
  playback,
  connection,
  applySnapshot,
  refreshAuthoritativeSnapshot,
  dispatchPlaybackUi,
}: Options) {
  const [interaction, setInteraction] = useState<VolumeInteraction>({ kind: "idle" });
  const [isVolumeUpdatePending, setVolumePending] = useState(false);
  const [isMutePending, setMutePending] = useState(false);
  const playbackRef = useRef(playback);
  const connectionRef = useRef(connection);
  const interactionRef = useRef(interaction);
  const lastNonZeroVolume = useRef(100);
  const desiredVolume = useRef<number | null>(null);
  const desiredMute = useRef<MuteIntent | null>(null);
  const inFlight = useRef<"volume" | "mute" | null>(null);
  const inFlightMute = useRef<MuteIntent | null>(null);
  const draining = useRef(false);

  useEffect(() => {
    playbackRef.current = playback;
    connectionRef.current = connection;
    if (playback.volume > 0) lastNonZeroVolume.current = normalize(playback.volume * 100);
  }, [connection, playback]);

  const publishInteraction = useCallback((next: VolumeInteraction) => {
    interactionRef.current = next;
    setInteraction(next);
  }, []);
  const startInteraction = useCallback(() => {
    const current = interactionRef.current;
    const value =
      current.kind === "idle" ? normalize(playbackRef.current.volume * 100) : current.value;
    publishInteraction({
      kind: "adjusting",
      value,
      startValue: value,
      startMuted: playbackRef.current.muted,
    });
  }, [publishInteraction]);

  const drain = useCallback(async () => {
    if (draining.current || connectionRef.current !== "ready") return;
    draining.current = true;
    try {
      while (desiredVolume.current !== null || desiredMute.current !== null) {
        const volumeTarget = desiredVolume.current;
        if (volumeTarget !== null) {
          desiredVolume.current = null;
          inFlight.current = "volume";
          setVolumePending(true);
          dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
          try {
            applySnapshot(await setPlaybackVolume(volumeTarget / 100));
            dispatchPlaybackUi({ type: "commandSucceeded", lane: "volume" });
          } catch (error) {
            desiredVolume.current = null;
            desiredMute.current =
              desiredMute.current?.kind === "volumeInteraction" ? null : desiredMute.current;
            dispatchPlaybackUi({
              type: "commandFailed",
              lane: "volume",
              message:
                isSetPlaybackVolumeError(error) && error.code === "invalidVolume"
                  ? "The playback volume is invalid."
                  : "The playback volume could not be changed.",
            });
            await refreshAuthoritativeSnapshot();
          } finally {
            inFlight.current = null;
            setVolumePending(false);
          }
          continue;
        }
        const muteTarget = desiredMute.current;
        if (!muteTarget) break;
        desiredMute.current = null;
        inFlightMute.current = muteTarget;
        inFlight.current = "mute";
        setMutePending(true);
        dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
        try {
          applySnapshot(await (muteTarget.target ? muteAudioPlayback() : unmuteAudioPlayback()));
          dispatchPlaybackUi({ type: "commandSucceeded", lane: "volume" });
        } catch (error) {
          dispatchPlaybackUi({
            type: "commandFailed",
            lane: "volume",
            message: isPlaybackMuteError(error)
              ? "The playback mute state could not be changed."
              : "An unexpected playback error occurred.",
          });
          await refreshAuthoritativeSnapshot();
        } finally {
          inFlight.current = null;
          inFlightMute.current = null;
          setMutePending(false);
        }
      }
    } finally {
      draining.current = false;
      if (
        interactionRef.current.kind === "settling" &&
        inFlight.current === null &&
        desiredVolume.current === null &&
        desiredMute.current === null
      )
        publishInteraction({ kind: "idle" });
    }
  }, [applySnapshot, dispatchPlaybackUi, publishInteraction, refreshAuthoritativeSnapshot]);

  const updateVolume = useCallback(
    (value: number) => {
      const target = normalize(value);
      if (interactionRef.current.kind === "idle") startInteraction();
      const current = playbackRef.current;
      if (target > 0) {
        const pendingMute = desiredMute.current ?? inFlightMute.current;
        if (current.muted || pendingMute?.target === true) {
          desiredMute.current = { target: false, kind: "volumeInteraction" };
        } else if (desiredMute.current?.kind === "explicit") {
          desiredMute.current = null;
        }
      }
      desiredVolume.current = target;
      publishInteraction({
        ...(interactionRef.current.kind === "idle"
          ? {
              kind: "adjusting",
              startValue: normalize(current.volume * 100),
              startMuted: current.muted,
            }
          : interactionRef.current),
        kind: "adjusting",
        value: target,
      });
      void drain();
    },
    [drain, publishInteraction, startInteraction],
  );

  const commitVolume = useCallback(
    (value: number) => {
      const target = normalize(value);
      if (interactionRef.current.kind === "idle") startInteraction();
      const current = playbackRef.current;
      if (target > 0) {
        const pendingMute = desiredMute.current ?? inFlightMute.current;
        if (current.muted || pendingMute?.target === true) {
          desiredMute.current = { target: false, kind: "volumeInteraction" };
        } else if (desiredMute.current?.kind === "explicit") {
          desiredMute.current = null;
        }
      }
      desiredVolume.current = target;
      publishInteraction({
        ...interactionRef.current,
        kind: "settling",
        value: target,
      } as VolumeInteraction);
      void drain();
    },
    [drain, publishInteraction, startInteraction],
  );

  const cancelVolume = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind === "idle") return;
    desiredVolume.current = current.startValue;
    desiredMute.current =
      current.startMuted === playbackRef.current.muted
        ? null
        : { target: current.startMuted, kind: "volumeInteraction" };
    publishInteraction({ ...current, kind: "settling", value: current.startValue });
    void drain();
  }, [drain, publishInteraction]);

  const volumeButtonPress = useCallback(() => {
    if (connectionRef.current !== "ready" || isMutePending) return;
    const current = playbackRef.current;
    const value = normalize(current.volume * 100);
    if (value === 0) {
      desiredVolume.current = lastNonZeroVolume.current;
      desiredMute.current = { target: false, kind: "volumeInteraction" };
    } else {
      desiredMute.current = { target: !current.muted, kind: "explicit" };
    }
    void drain();
  }, [drain, isMutePending]);

  return {
    volumeValue: interaction.kind === "idle" ? normalize(playback.volume * 100) : interaction.value,
    isVolumeUpdatePending,
    isMutePending,
    onVolumeChange: updateVolume,
    onVolumePointerDown: startInteraction,
    onVolumeCommit: commitVolume,
    onVolumePointerCancel: cancelVolume,
    onVolumeButtonPress: volumeButtonPress,
  };
}
