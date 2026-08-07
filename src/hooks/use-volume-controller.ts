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
  | { kind: "adjusting" | "settling"; value: number; startValue: number; failed: boolean };

interface UseVolumeControllerOptions {
  playback: PlaybackSnapshot;
  connection: PlaybackConnectionState;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  refreshAuthoritativeSnapshot: () => Promise<void>;
  dispatchPlaybackUi: (action: PlaybackUiAction) => void;
}

function normalizeVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function useVolumeController({
  playback,
  connection,
  applySnapshot,
  refreshAuthoritativeSnapshot,
  dispatchPlaybackUi,
}: UseVolumeControllerOptions) {
  const [interaction, setInteraction] = useState<VolumeInteraction>({ kind: "idle" });
  const [isSetVolumePending, setIsSetVolumePending] = useState(false);
  const [isMutePending, setIsMutePending] = useState(false);
  const interactionRef = useRef(interaction);
  const playbackRef = useRef(playback);
  const connectionRef = useRef(connection);
  const inFlightRef = useRef<number | null>(null);
  const queuedRef = useRef<number | null>(null);
  const drainingRef = useRef(false);
  const failedRef = useRef(false);

  useEffect(() => {
    playbackRef.current = playback;
    connectionRef.current = connection;
  }, [connection, playback]);

  const setInteractionValue = useCallback((value: number, kind: "adjusting" | "settling") => {
    const current = interactionRef.current;
    const next: VolumeInteraction =
      current.kind === "idle"
        ? {
            kind,
            value,
            startValue: normalizeVolume(playbackRef.current.volume * 100),
            failed: false,
          }
        : { ...current, kind, value };
    interactionRef.current = next;
    setInteraction(next);
  }, []);

  const drainVolume = useCallback(async () => {
    if (drainingRef.current || connectionRef.current !== "ready") return;
    drainingRef.current = true;
    try {
      while (!failedRef.current && queuedRef.current !== null) {
        const target = queuedRef.current;
        queuedRef.current = null;
        if (target === null) break;

        inFlightRef.current = target;
        setIsSetVolumePending(true);
        dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
        try {
          applySnapshot(await setPlaybackVolume(target / 100));
          dispatchPlaybackUi({ type: "commandSucceeded", lane: "volume" });
        } catch (error: unknown) {
          failedRef.current = true;
          queuedRef.current = null;
          dispatchPlaybackUi({
            type: "commandFailed",
            lane: "volume",
            message:
              isSetPlaybackVolumeError(error) && error.code === "invalidVolume"
                ? "The playback volume is invalid."
                : "The playback volume could not be changed.",
          });
          await refreshAuthoritativeSnapshot();
          if (interactionRef.current.kind === "settling") {
            interactionRef.current = { kind: "idle" };
            setInteraction({ kind: "idle" });
          }
        } finally {
          inFlightRef.current = null;
          setIsSetVolumePending(false);
        }
      }
    } finally {
      drainingRef.current = false;
      if (
        !failedRef.current &&
        interactionRef.current.kind === "settling" &&
        inFlightRef.current === null &&
        queuedRef.current === null
      ) {
        interactionRef.current = { kind: "idle" };
        setInteraction({ kind: "idle" });
      }
    }
  }, [applySnapshot, dispatchPlaybackUi, refreshAuthoritativeSnapshot]);

  const recordDesiredValue = useCallback((value: number) => {
    const target = normalizeVolume(value);
    const authoritative = normalizeVolume(playbackRef.current.volume * 100);
    const inFlight = inFlightRef.current;
    if (failedRef.current) return target;
    if (inFlight !== null && target === inFlight) {
      queuedRef.current = null;
    } else if (inFlight === null && target === authoritative) {
      queuedRef.current = null;
    } else {
      queuedRef.current = target;
    }
    return target;
  }, []);

  const beginVolume = useCallback(() => {
    const displayed =
      interactionRef.current.kind === "idle"
        ? normalizeVolume(playbackRef.current.volume * 100)
        : interactionRef.current.value;
    failedRef.current = false;
    const next: VolumeInteraction = {
      kind: "adjusting",
      value: displayed,
      startValue: displayed,
      failed: false,
    };
    interactionRef.current = next;
    setInteraction(next);
  }, []);

  const updateVolume = useCallback(
    (value: number) => {
      const target = normalizeVolume(value);
      if (interactionRef.current.kind === "idle") beginVolume();
      setInteractionValue(target, "adjusting");
      recordDesiredValue(target);
      void drainVolume();
    },
    [beginVolume, drainVolume, recordDesiredValue, setInteractionValue],
  );

  const finishVolume = useCallback(
    (value: number) => {
      const target = normalizeVolume(value);
      if (interactionRef.current.kind === "idle") beginVolume();
      const finalValue = recordDesiredValue(target);
      if (failedRef.current) {
        interactionRef.current = { kind: "idle" };
        setInteraction({ kind: "idle" });
        return;
      }
      setInteractionValue(finalValue, "settling");
      void drainVolume();
    },
    [beginVolume, drainVolume, recordDesiredValue, setInteractionValue],
  );

  const cancelVolume = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind === "idle") return;
    const rollback = current.startValue;
    if (failedRef.current) {
      interactionRef.current = { kind: "idle" };
      setInteraction({ kind: "idle" });
      return;
    }
    recordDesiredValue(rollback);
    setInteractionValue(rollback, "settling");
    void drainVolume();
  }, [drainVolume, recordDesiredValue, setInteractionValue]);

  const toggleMute = useCallback(async () => {
    if (inFlightRef.current !== null || isMutePending || connectionRef.current !== "ready") return;
    setIsMutePending(true);
    dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
    try {
      const current = playbackRef.current;
      applySnapshot(await (current.muted ? unmuteAudioPlayback() : muteAudioPlayback()));
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "volume" });
    } catch (error: unknown) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "volume",
        message: isPlaybackMuteError(error)
          ? "The playback mute state could not be changed."
          : "An unexpected playback error occurred.",
      });
      await refreshAuthoritativeSnapshot();
    } finally {
      setIsMutePending(false);
    }
  }, [applySnapshot, dispatchPlaybackUi, isMutePending, refreshAuthoritativeSnapshot]);

  return {
    volumeValue:
      interaction.kind === "idle" ? normalizeVolume(playback.volume * 100) : interaction.value,
    isVolumePending: isSetVolumePending || isMutePending,
    isVolumeSliderDisabled: isMutePending,
    onVolumeChange: updateVolume,
    onVolumePointerDown: beginVolume,
    onVolumeCommit: finishVolume,
    onVolumePointerCancel: cancelVolume,
    onMuteToggle: toggleMute,
  };
}
