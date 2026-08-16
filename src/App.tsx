import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  isAudioDeviceListError,
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "@/api/audio-devices";
import {
  isStartLibraryAlbumError,
  isStartLibraryTrackError,
  startLibraryAlbum,
  startLibraryAlbumTrack,
  startLibraryTrack,
} from "@/api/library";
import {
  getPlaybackState,
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  listenToPlaybackState,
  pauseAudioPlayback,
  previousAudioPlayback,
  nextAudioPlayback,
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
import { ApplicationActivityIndicator } from "./components/ApplicationActivityIndicator";
import { PlaybackDock } from "./components/PlaybackDock";
import { LibraryView } from "./features/library";
import { SettingsView } from "./features/settings";
import { useActiveTrackIdentity } from "./hooks/use-active-track-identity";
import { useSeekController } from "./hooks/use-seek-controller";
import { useVolumeController } from "./hooks/use-volume-controller";
import { useLibraryScan } from "./features/library/use-library-scan";
import { useApplicationActivities } from "./hooks/use-application-activities";
import { initialPlaybackUiState, playbackUiReducer } from "./lib/playback-state";

type TransportOperation =
  | { type: "stop" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "startTrack"; trackId: string }
  | { type: "startAlbum"; albumId: string }
  | { type: "startAlbumTrack"; albumId: string; trackId: string }
  | { type: "previous" }
  | { type: "next" };
type PendingTransportCommand = "stop" | "pause" | "resume" | "previous" | "next" | null;
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
  const [mainScrollElement, setMainScrollElement] = useState<HTMLElement | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isOutputSelectionPending, setIsOutputSelectionPending] = useState(false);
  const { snapshot: scan, error: scanError, libraryRefreshKey } = useLibraryScan();
  const { selected: applicationActivity } = useApplicationActivities();
  const [playbackUi, dispatchPlaybackUi] = useReducer(playbackUiReducer, initialPlaybackUiState);
  const [pendingTransportCommand, setPendingTransportCommand] =
    useState<PendingTransportCommand>(null);
  const playback = playbackUi.snapshot;
  const latestPlaybackRef = useRef(playback);
  const connectionRef = useRef(playbackUi.connection);
  const transportPendingRef = useRef(false);
  const outputPendingRef = useRef(false);
  const deviceRequest = useRef(0);
  const queuedTransportRef = useRef<TransportOperation | null>(null);
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
  async function requestTransport(operation: TransportOperation) {
    if (transportPendingRef.current) {
      queuedTransportRef.current = operation;
      return;
    }
    if (connectionRef.current !== "ready") return;
    const command = operation.type;
    const currentPlayback = latestPlaybackRef.current;
    const valid =
      command === "startTrack" ||
      command === "startAlbum" ||
      command === "startAlbumTrack" ||
      (command === "previous" && currentPlayback.canGoPrevious) ||
      (command === "next" && currentPlayback.canGoNext) ||
      (command === "stop" &&
        (currentPlayback.status === "playing" || currentPlayback.status === "paused")) ||
      (command === "pause" && currentPlayback.status === "playing") ||
      (command === "resume" && currentPlayback.status === "paused");
    if (!valid) return;
    transportPendingRef.current = true;
    setPendingTransportCommand(
      command === "startTrack" || command === "startAlbum" || command === "startAlbumTrack"
        ? "resume"
        : command,
    );
    try {
      const snapshot =
        command === "startTrack"
          ? await startLibraryTrack(operation.trackId)
          : command === "startAlbum"
            ? await startLibraryAlbum(operation.albumId)
            : command === "startAlbumTrack"
              ? await startLibraryAlbumTrack(operation.albumId, operation.trackId)
              : command === "previous"
                ? await previousAudioPlayback()
                : command === "next"
                  ? await nextAudioPlayback()
                  : command === "stop"
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
          (command === "startTrack" || command === "startAlbumTrack") &&
          isStartLibraryTrackError(error) &&
          error.code === "trackUnavailable"
            ? "This track is no longer available."
            : command === "startAlbum" &&
                isStartLibraryAlbumError(error) &&
                error.code === "noPlayableTracks"
              ? "This album has no playable tracks."
              : command === "pause" && isPauseAudioPlaybackError(error)
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
  const main =
    destination === "library" ? (
      <LibraryView
        playbackAvailable={isPlaybackAvailable}
        onOpenSettings={() => setDestination("settings")}
        onPlayTrack={(id) => void requestTransport({ type: "startTrack", trackId: id })}
        onPlayAlbum={(id) => void requestTransport({ type: "startAlbum", albumId: id })}
        onPlayAlbumTrack={(albumId, trackId) =>
          void requestTransport({ type: "startAlbumTrack", albumId, trackId })
        }
        activeTrackId={activeTrack.id}
        playbackStatus={playback.status}
        libraryRefreshKey={libraryRefreshKey}
        scanError={scanError}
        scrollElement={mainScrollElement}
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
        scan={scan}
        scanError={scanError}
      />
    );
  return (
    <AppShell
      destination={destination}
      onDestinationChange={setDestination}
      mainScrollRef={setMainScrollElement}
      main={main}
      activity={<ApplicationActivityIndicator activity={applicationActivity} />}
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
          isVolumeUpdatePending={volumeController.isVolumeUpdatePending}
          isMutePending={volumeController.isMutePending}
          playbackError={
            playbackUi.commandError?.message ??
            playbackUi.connectionError ??
            (playback.status === "failed" ? formatPlaybackFailure(playback.error) : null)
          }
          presentationTitle={activeTrack.title}
          presentationArtist={activeTrack.artist}
          artworkUrl={activeTrack.artworkUrl}
          artworkLoading={activeTrack.artworkLoading}
          onPlay={() => void requestTransport({ type: "resume" })}
          onPause={() => void requestTransport({ type: "pause" })}
          onResume={() => void requestTransport({ type: "resume" })}
          onPrevious={() => void requestTransport({ type: "previous" })}
          onNext={() => void requestTransport({ type: "next" })}
          onSeek={seekController.onSeek}
          onSeekCommit={(value) => void seekController.onSeekCommit(value)}
          onSeekCancel={seekController.onSeekCancel}
          onVolumeChange={volumeController.onVolumeChange}
          onVolumeInteractionStart={volumeController.onVolumePointerDown}
          onVolumeCommit={volumeController.onVolumeCommit}
          onVolumePointerCancel={volumeController.onVolumePointerCancel}
          onVolumeButtonPress={volumeController.onVolumeButtonPress}
        />
      }
    />
  );
}
export default App;

