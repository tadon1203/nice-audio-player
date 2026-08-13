import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  isAudioDeviceListError,
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "@/api/audio-devices";
import { isStartLibraryTrackError, startLibraryTrack } from "@/api/library";
import {
  getPlaybackState,
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  listenToPlaybackState,
  pauseAudioPlayback,
  resumeAudioPlayback,
  stopAudioPlayback,
} from "@/api/audio-files";
import type {
  AudioOutputDevice,
  AudioOutputSelection,
  PlaybackFailureCode,
  PlaybackSnapshot,
} from "@/bindings";
import { AppShell } from "./components/AppShell";
import { LibraryView } from "./components/LibraryView";
import { PlaybackDock } from "./components/PlaybackDock";
import { SettingsView } from "./components/SettingsView";
import { useActiveTrackIdentity } from "./hooks/use-active-track-identity";
import { useSeekController } from "./hooks/use-seek-controller";
import { useVolumeController } from "./hooks/use-volume-controller";
import { initialPlaybackUiState, playbackUiReducer } from "./lib/playback-state";

type PendingTransportCommand = "stop" | "pause" | "resume" | null;
function formatPlaybackFailure(code: PlaybackFailureCode): string {
  const messages: Record<PlaybackFailureCode, string> = {
    noOutputDevice: "No audio output device is available.",
    outputDeviceUnavailable: "The selected output device is unavailable.",
    unsupportedOutputConfiguration: "The output device configuration is unsupported.",
    outputStreamBuildFailed: "The audio output could not be prepared.",
    outputStreamStartFailed: "The audio output could not be started.",
    outputStreamPauseFailed: "The audio output could not be paused.",
    outputStreamResumeFailed: "The audio output could not be resumed.",
    outputStreamRuntimeFailed: "The audio output stopped unexpectedly.",
    completionTimingFailed: "Playback completion could not be determined.",
    decodeFailed: "The audio file could not be decoded.",
    sampleRateConversionFailed: "The audio could not be converted.",
  };
  return messages[code];
}

function App() {
  const [destination, setDestination] = useState<"library" | "settings">("library");
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isOutputSelectionPending, setIsOutputSelectionPending] = useState(false);
  const [playbackUi, dispatchPlaybackUi] = useReducer(playbackUiReducer, initialPlaybackUiState);
  const [pendingTransportCommand, setPendingTransportCommand] =
    useState<PendingTransportCommand>(null);
  const playback = playbackUi.snapshot;
  const latestPlaybackRef = useRef(playback);
  const connectionRef = useRef(playbackUi.connection);
  const transportPendingRef = useRef(false);
  const outputPendingRef = useRef(false);
  const deviceRequest = useRef(0);
  const queuedTransportRef = useRef<Exclude<PendingTransportCommand, null> | null>(null);
  const subscriptionHealthyRef = useRef(true);
  useEffect(() => {
    latestPlaybackRef.current = playback;
    connectionRef.current = playbackUi.connection;
  }, [playback, playbackUi.connection]);
  const isPlaybackAvailable = playbackUi.connection === "ready";
  const isTransportCommandPending = pendingTransportCommand !== null;
  const activeTrack = useActiveTrackIdentity(playback.file);
  const applySnapshot = useCallback((snapshot: PlaybackSnapshot) => {
    if (snapshot.revision <= latestPlaybackRef.current.revision) return false;
    latestPlaybackRef.current = snapshot;
    dispatchPlaybackUi({ type: "snapshotReceived", snapshot });
    return true;
  }, []);
  const refresh = useCallback(async () => {
    try {
      applySnapshot(await getPlaybackState());
    } catch {
      dispatchPlaybackUi({
        type: "connectionUnavailable",
        message: "The playback service could not be synchronized.",
      });
    }
  }, [applySnapshot]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        unsubscribe = await listenToPlaybackState(
          (snapshot) => {
            if (active) applySnapshot(snapshot);
          },
          () => {
            subscriptionHealthyRef.current = false;
            dispatchPlaybackUi({
              type: "connectionUnavailable",
              message: "Playback updates could not be read.",
            });
          },
        );
        const snapshot = await getPlaybackState();
        if (active) {
          applySnapshot(snapshot);
          if (subscriptionHealthyRef.current) dispatchPlaybackUi({ type: "connectionReady" });
        }
      } catch {
        if (active)
          dispatchPlaybackUi({
            type: "connectionUnavailable",
            message: "The playback service could not be synchronized.",
          });
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySnapshot]);
  async function loadOutputDevices() {
    const token = ++deviceRequest.current;
    setIsLoadingDevices(true);
    try {
      const devices = await listAudioOutputDevices();
      if (token === deviceRequest.current) setOutputDevices(devices);
    } catch (error) {
      if (token === deviceRequest.current)
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message: isAudioDeviceListError(error)
            ? "Audio output devices could not be enumerated."
            : "Audio output devices could not be loaded.",
        });
    } finally {
      if (token === deviceRequest.current) setIsLoadingDevices(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void loadOutputDevices(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function requestTransport(command: Exclude<PendingTransportCommand, null>) {
    if (transportPendingRef.current) {
      queuedTransportRef.current = command;
      return;
    }
    if (connectionRef.current !== "ready") return;
    const valid =
      (command === "stop" && (playback.status === "playing" || playback.status === "paused")) ||
      (command === "pause" && playback.status === "playing") ||
      (command === "resume" && playback.status === "paused");
    if (!valid) return;
    transportPendingRef.current = true;
    setPendingTransportCommand(command);
    try {
      const snapshot =
        command === "stop"
          ? await stopAudioPlayback()
          : command === "pause"
            ? await pauseAudioPlayback()
            : await resumeAudioPlayback();
      applySnapshot(snapshot);
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "transport" });
    } catch (error) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "transport",
        message:
          command === "pause" && isPauseAudioPlaybackError(error)
            ? "Playback cannot be paused in its current state."
            : command === "resume" && isResumeAudioPlaybackError(error)
              ? "Playback cannot be resumed in its current state."
              : "The playback service is unavailable.",
      });
      await refresh();
    } finally {
      transportPendingRef.current = false;
      setPendingTransportCommand(null);
      const queued = queuedTransportRef.current;
      queuedTransportRef.current = null;
      if (queued) void requestTransport(queued);
    }
  }
  async function changeOutputSelection(selection: AudioOutputSelection) {
    if (
      outputPendingRef.current ||
      transportPendingRef.current ||
      isLoadingDevices ||
      !isPlaybackAvailable ||
      playback.status === "playing" ||
      playback.status === "paused"
    )
      return;
    outputPendingRef.current = true;
    setIsOutputSelectionPending(true);
    try {
      applySnapshot(await setAudioOutputSelection(selection));
    } catch (error) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "output",
        message:
          isSetAudioOutputSelectionError(error) && error.code === "invalidPlaybackState"
            ? "Stop playback before changing the output device."
            : isSetAudioOutputSelectionError(error) && error.code === "outputDeviceUnavailable"
              ? "The selected output device is unavailable."
              : "The output device could not be changed.",
      });
      await refresh();
    } finally {
      outputPendingRef.current = false;
      setIsOutputSelectionPending(false);
    }
  }
  const seekController = useSeekController({
    playback,
    connection: playbackUi.connection,
    isTransportCommandPending,
    isOutputSelectionPending,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
    dispatchPlaybackUi,
  });
  const volumeController = useVolumeController({
    playback,
    connection: playbackUi.connection,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
    dispatchPlaybackUi,
  });
  async function playLibraryTrack(id: string) {
    if (!isPlaybackAvailable) return;
    if (transportPendingRef.current) {
      queuedTransportRef.current = "resume";
      return;
    }
    transportPendingRef.current = true;
    setPendingTransportCommand("resume");
    try {
      applySnapshot(await startLibraryTrack(id));
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "transport" });
    } catch (error) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "transport",
        message:
          isStartLibraryTrackError(error) && error.code === "trackUnavailable"
            ? "This track is no longer available."
            : "The selected track could not be played.",
      });
      await refresh();
    } finally {
      transportPendingRef.current = false;
      setPendingTransportCommand(null);
    }
  }
  const main =
    destination === "library" ? (
      <LibraryView
        playbackAvailable={isPlaybackAvailable}
        onOpenSettings={() => setDestination("settings")}
        onPlayTrack={(id) => void playLibraryTrack(id)}
      />
    ) : (
      <SettingsView
        outputDevices={outputDevices}
        selectedOutput={playback.outputSelection}
        onOutputSelectionChange={(value) => void changeOutputSelection(value)}
        onRefreshDevices={() => void loadOutputDevices()}
        outputDisabled={
          isOutputSelectionPending ||
          isTransportCommandPending ||
          isLoadingDevices ||
          !isPlaybackAvailable ||
          playback.status === "playing" ||
          playback.status === "paused"
        }
      />
    );
  return (
    <AppShell
      destination={destination}
      onDestinationChange={setDestination}
      main={main}
      dock={
        <PlaybackDock
          playback={playback}
          hasResumablePlayback={playback.status === "paused"}
          isPlaybackAvailable={isPlaybackAvailable}
          isTransportCommandPending={isTransportCommandPending}
          pendingTransportCommand={pendingTransportCommand}
          seekPreviewMs={seekController.seekPreviewMs}
          isSeekPending={seekController.isSeekPending}
          volumeValue={volumeController.volumeValue}
          isVolumePending={volumeController.isVolumePending}
          isVolumeSliderDisabled={volumeController.isVolumeSliderDisabled}
          playbackError={
            playbackUi.commandError?.message ??
            playbackUi.connectionError ??
            (playback.status === "failed" ? formatPlaybackFailure(playback.error) : null)
          }
          presentationTitle={activeTrack.title}
          presentationArtist={activeTrack.artist}
          artworkUrl={activeTrack.artworkUrl}
          artworkLoading={activeTrack.artworkLoading}
          onPlay={() => void requestTransport("resume")}
          onPause={() => void requestTransport("pause")}
          onResume={() => void requestTransport("resume")}
          onStop={() => void requestTransport("stop")}
          onSeek={seekController.onSeek}
          onSeekCommit={(value) => void seekController.onSeekCommit(value)}
          onSeekCancel={seekController.onSeekCancel}
          onVolumeChange={volumeController.onVolumeChange}
          onVolumePointerDown={volumeController.onVolumePointerDown}
          onVolumeCommit={volumeController.onVolumeCommit}
          onVolumePointerCancel={volumeController.onVolumePointerCancel}
          onMuteToggle={() => void volumeController.onMuteToggle()}
        />
      }
    />
  );
}
export default App;
