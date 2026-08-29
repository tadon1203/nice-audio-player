import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAudioDeviceListError,
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "@/api/audio-devices";
import type { AudioOutputDevice, AudioOutputSelection } from "@/bindings";
import type { PlaybackSnapshot } from "@/bindings";
import type { PlaybackUiAction } from "@/lib/playback-state";
import { diagnostics } from "@/lib/diagnostics";

export function useAudioOutputController({
  playback,
  isTransportPending,
  isPlaybackAvailable,
  applySnapshot,
  dispatchPlaybackUi,
  refreshAuthoritativeSnapshot,
}: {
  playback: PlaybackSnapshot;
  isTransportPending: boolean;
  isPlaybackAvailable: boolean;
  applySnapshot: (snapshot: PlaybackSnapshot) => boolean;
  dispatchPlaybackUi: (action: PlaybackUiAction) => void;
  refreshAuthoritativeSnapshot: () => Promise<void>;
}) {
  const [devices, setDevices] = useState<AudioOutputDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const loadDevices = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listAudioOutputDevices();
      if (id === requestId.current) setDevices(result);
    } catch (cause) {
      diagnostics.warn("frontend.audio_output.device_list_failed", { cause });
      if (id === requestId.current)
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message: isAudioDeviceListError(cause)
            ? "Audio output devices could not be enumerated."
            : "Audio output devices could not be loaded.",
        });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [dispatchPlaybackUi]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadDevices(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDevices]);
  const selectDevice = useCallback(
    async (selection: AudioOutputSelection) => {
      if (
        pending ||
        isTransportPending ||
        loading ||
        !isPlaybackAvailable ||
        playback.status === "playing" ||
        playback.status === "paused"
      )
        return;
      setPending(true);
      try {
        applySnapshot(await setAudioOutputSelection(selection));
      } catch (cause) {
        diagnostics.warn("frontend.audio_output.selection_failed", { cause });
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message:
            isSetAudioOutputSelectionError(cause) && cause.code === "invalidPlaybackState"
              ? "Stop playback before changing the output device."
              : isSetAudioOutputSelectionError(cause) && cause.code === "outputDeviceUnavailable"
                ? "The selected output device is unavailable."
                : "The output device could not be changed.",
        });
        await refreshAuthoritativeSnapshot();
      } finally {
        setPending(false);
      }
    },
    [
      applySnapshot,
      dispatchPlaybackUi,
      isPlaybackAvailable,
      isTransportPending,
      loading,
      pending,
      playback.status,
      refreshAuthoritativeSnapshot,
    ],
  );
  return { devices, loading, pending, loadDevices, selectDevice };
}
