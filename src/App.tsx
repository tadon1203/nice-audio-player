import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  isAudioDeviceListError,
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "@/api/audio-devices";
import {
  getPlaybackState,
  isAudioFileValidationError,
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  isStartAudioFileError,
  listenToPlaybackState,
  pauseAudioPlayback,
  resumeAudioPlayback,
  startAudioFile,
  stopAudioPlayback,
  validateAudioFile,
} from "@/api/audio-files";
import type {
  AudioOutputDevice,
  AudioOutputSelection,
  PlaybackFailureCode,
  PlaybackSnapshot,
  ValidatedAudioFile,
} from "@/bindings";

import { AppShell } from "./components/AppShell";
import { NowPlayingView } from "./components/NowPlayingView";
import { PlaybackDock } from "./components/PlaybackDock";
import { useSeekController } from "./hooks/use-seek-controller";
import { useVolumeController } from "./hooks/use-volume-controller";
import { useActiveTrackIdentity } from "./hooks/use-active-track-identity";
import {
  commandForTransportIntent,
  initialPlaybackUiState,
  playbackUiReducer,
} from "./lib/playback-state";
import type { TransportCommand, TransportIntent } from "./lib/playback-state";

type PendingTransportCommand = "start" | "stop" | "pause" | "resume" | null;

function formatValidationError(error: unknown): string {
  if (!isAudioFileValidationError(error)) return "The selected file could not be validated.";
  switch (error.code) {
    case "emptyPath":
      return "Select an audio file first.";
    case "notFound":
      return "File not found.";
    case "notAFile":
      return "The selected path is not a file.";
    case "unsupportedExtension":
      return error.details?.extension
        ? `.${error.details.extension} is not currently supported.`
        : "The selected file has no supported extension.";
    case "invalidFileName":
      return "The selected file name is invalid.";
  }
}

function formatPlaybackFailure(code: PlaybackFailureCode): string {
  switch (code) {
    case "noOutputDevice":
      return "No audio output device is available.";
    case "outputDeviceUnavailable":
      return "The selected output device is unavailable.";
    case "unsupportedOutputConfiguration":
      return "The output device configuration is unsupported.";
    case "outputStreamBuildFailed":
      return "The audio output could not be prepared.";
    case "outputStreamStartFailed":
      return "The audio output could not be started.";
    case "outputStreamPauseFailed":
      return "The audio output could not be paused.";
    case "outputStreamResumeFailed":
      return "The audio output could not be resumed.";
    case "outputStreamRuntimeFailed":
      return "The audio output stopped unexpectedly.";
    case "completionTimingFailed":
      return "Playback completion could not be determined.";
    case "decodeFailed":
      return "The audio file could not be decoded.";
    case "sampleRateConversionFailed":
      return "The audio could not be converted for the selected output.";
  }
}

function App() {
  const [fileOverride, setFileOverride] = useState<ValidatedAudioFile | null | undefined>(
    undefined,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [deviceListError, setDeviceListError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isOutputSelectionPending, setIsOutputSelectionPending] = useState(false);
  const [playbackUi, dispatchPlaybackUi] = useReducer(playbackUiReducer, initialPlaybackUiState);
  const playback = playbackUi.snapshot;
  const validatedFile = fileOverride === undefined ? playback.file : fileOverride;
  const [pendingTransportCommand, setPendingTransportCommand] =
    useState<PendingTransportCommand>(null);
  const latestPlaybackRef = useRef(playback);
  const readyFileRef = useRef(validatedFile);
  const connectionRef = useRef(playbackUi.connection);
  const connectionHealthyRef = useRef(true);
  const transportPendingRef = useRef(false);
  const queuedTransportIntentRef = useRef<TransportIntent | null>(null);
  const outputSelectionPendingRef = useRef(false);
  const validationRequestRef = useRef(0);
  const fileSelectionPendingRef = useRef(false);
  const deviceListRequestRef = useRef(0);

  latestPlaybackRef.current = playback;
  readyFileRef.current = validatedFile;
  connectionRef.current = playbackUi.connection;

  const isTransportCommandPending = pendingTransportCommand !== null;
  const isTimedPlayback = playback.status === "playing" || playback.status === "paused";
  const isPlaybackAvailable = playbackUi.connection === "ready";
  const activeTrack = useActiveTrackIdentity(validatedFile);

  const applySnapshot = useCallback((snapshot: PlaybackSnapshot) => {
    if (snapshot.revision <= latestPlaybackRef.current.revision) return false;
    latestPlaybackRef.current = snapshot;
    dispatchPlaybackUi({ type: "snapshotReceived", snapshot });
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initializePlaybackState() {
      try {
        const registeredUnsubscribe = await listenToPlaybackState(
          (snapshot) => {
            if (!active) return;
            applySnapshot(snapshot);
          },
          () => {
            if (active) {
              connectionHealthyRef.current = false;
              dispatchPlaybackUi({
                type: "connectionUnavailable",
                message:
                  "Playback updates could not be read. Restart the application to reconnect.",
              });
            }
          },
        );
        if (!active) {
          registeredUnsubscribe();
          return;
        }
        unsubscribe = registeredUnsubscribe;
        const snapshot = await getPlaybackState();
        if (active) {
          applySnapshot(snapshot);
          if (connectionHealthyRef.current) dispatchPlaybackUi({ type: "connectionReady" });
        }
      } catch {
        if (active) {
          connectionHealthyRef.current = false;
          dispatchPlaybackUi({
            type: "connectionUnavailable",
            message:
              "The playback service could not be synchronized. Restart the application to retry.",
          });
        }
      }
    }
    void initializePlaybackState();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySnapshot]);

  useEffect(() => {
    void loadOutputDevices();
  }, []);

  async function selectAudioFile() {
    if (
      fileSelectionPendingRef.current ||
      transportPendingRef.current ||
      connectionRef.current !== "ready" ||
      latestPlaybackRef.current.status === "playing" ||
      latestPlaybackRef.current.status === "paused"
    )
      return;
    fileSelectionPendingRef.current = true;
    let result: string | string[] | null;
    try {
      result = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "m4a", "aac"] }],
      });
    } catch {
      setValidationError("The audio file picker could not be opened.");
      fileSelectionPendingRef.current = false;
      return;
    }
    if (typeof result !== "string") {
      fileSelectionPendingRef.current = false;
      return;
    }
    setValidationError(null);
    setIsValidatingFile(true);
    const request = validationRequestRef.current + 1;
    validationRequestRef.current = request;
    try {
      const file = await validateAudioFile(result);
      if (request === validationRequestRef.current) setFileOverride(file);
    } catch (error: unknown) {
      if (request === validationRequestRef.current) {
        setFileOverride(null);
        setValidationError(formatValidationError(error));
      }
    } finally {
      if (request === validationRequestRef.current) setIsValidatingFile(false);
      fileSelectionPendingRef.current = false;
    }
  }

  function requestTransport(intent: TransportIntent) {
    if (connectionRef.current !== "ready" || outputSelectionPendingRef.current) return;
    queuedTransportIntentRef.current = intent;
    void drainTransportIntents();
  }

  async function drainTransportIntents(): Promise<void> {
    if (transportPendingRef.current) return;
    const intent = queuedTransportIntentRef.current;
    queuedTransportIntentRef.current = null;
    if (intent === null) return;

    const command = commandForTransportIntent(
      intent,
      latestPlaybackRef.current,
      readyFileRef.current !== null,
    );
    if (command === null) return;

    transportPendingRef.current = true;
    setPendingTransportCommand(command);
    dispatchPlaybackUi({ type: "commandStarted", lane: "transport" });
    try {
      const snapshot = await executeTransportCommand(command);
      applySnapshot(snapshot);
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "transport" });
    } catch (error: unknown) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "transport",
        message: formatTransportError(command, error),
      });
      await refreshAuthoritativeSnapshot();
    } finally {
      transportPendingRef.current = false;
      setPendingTransportCommand(null);
      if (queuedTransportIntentRef.current !== null) void drainTransportIntents();
    }
  }

  function executeTransportCommand(command: TransportCommand): Promise<PlaybackSnapshot> {
    switch (command) {
      case "start": {
        const file = readyFileRef.current;
        if (file === null) return Promise.reject(new Error("No validated file is available."));
        return startAudioFile(file.path);
      }
      case "stop":
        return stopAudioPlayback();
      case "pause":
        return pauseAudioPlayback();
      case "resume":
        return resumeAudioPlayback();
    }
  }

  async function refreshAuthoritativeSnapshot() {
    try {
      applySnapshot(await getPlaybackState());
    } catch {
      dispatchPlaybackUi({
        type: "connectionUnavailable",
        message:
          "The playback service could not be synchronized. Restart the application to retry.",
      });
    }
  }

  const seekController = useSeekController({
    playback,
    connection: playbackUi.connection,
    isTransportCommandPending,
    isOutputSelectionPending,
    applySnapshot,
    refreshAuthoritativeSnapshot,
    dispatchPlaybackUi,
  });
  const volumeController = useVolumeController({
    playback,
    connection: playbackUi.connection,
    applySnapshot,
    refreshAuthoritativeSnapshot,
    dispatchPlaybackUi,
  });

  async function loadOutputDevices() {
    const request = deviceListRequestRef.current + 1;
    deviceListRequestRef.current = request;
    setIsLoadingDevices(true);
    setDeviceListError(null);
    try {
      const devices = await listAudioOutputDevices();
      if (request === deviceListRequestRef.current) setOutputDevices(devices);
    } catch (error: unknown) {
      if (request === deviceListRequestRef.current) {
        setDeviceListError(
          isAudioDeviceListError(error)
            ? "Audio output devices could not be enumerated."
            : "An unexpected error occurred while listing audio devices.",
        );
      }
    } finally {
      if (request === deviceListRequestRef.current) setIsLoadingDevices(false);
    }
  }

  async function changeOutputSelection(selection: AudioOutputSelection) {
    const current = latestPlaybackRef.current;
    if (
      transportPendingRef.current ||
      outputSelectionPendingRef.current ||
      isLoadingDevices ||
      current.status === "playing" ||
      current.status === "paused" ||
      connectionRef.current !== "ready"
    )
      return;
    outputSelectionPendingRef.current = true;
    setIsOutputSelectionPending(true);
    dispatchPlaybackUi({ type: "commandStarted", lane: "output" });
    try {
      applySnapshot(await setAudioOutputSelection(selection));
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "output" });
    } catch (error: unknown) {
      if (isSetAudioOutputSelectionError(error) && error.code === "outputDeviceUnavailable") {
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message: "The selected output device is unavailable.",
        });
        await loadOutputDevices();
      } else if (isSetAudioOutputSelectionError(error) && error.code === "invalidPlaybackState") {
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message: "Stop playback before changing the output device.",
        });
      } else {
        dispatchPlaybackUi({
          type: "commandFailed",
          lane: "output",
          message: "The output device could not be changed.",
        });
      }
      await refreshAuthoritativeSnapshot();
    } finally {
      outputSelectionPendingRef.current = false;
      setIsOutputSelectionPending(false);
    }
  }

  const snapshotFailure =
    playback.status === "failed" ? formatPlaybackFailure(playback.error) : null;
  const playbackError =
    playbackUi.commandError?.message ?? playbackUi.connectionError ?? snapshotFailure;
  const isFileSelectionDisabled =
    !isPlaybackAvailable || isValidatingFile || isTransportCommandPending || isTimedPlayback;

  return (
    <AppShell
      main={
        <NowPlayingView
          validatedFile={validatedFile}
          isValidatingFile={isValidatingFile}
          isFileSelectionDisabled={isFileSelectionDisabled}
          validationError={validationError}
          onSelectFile={() => void selectAudioFile()}
          outputDevices={outputDevices}
          isLoadingDevices={isLoadingDevices}
          isOutputSelectionPending={isOutputSelectionPending}
          isPlaybackAvailable={isPlaybackAvailable}
          isTransportCommandPending={isTransportCommandPending}
          isTimedPlayback={isTimedPlayback}
          selectedOutput={playback.outputSelection}
          deviceListError={deviceListError}
          onStop={() => requestTransport("stopped")}
          onOutputSelectionChange={(selection) => void changeOutputSelection(selection)}
          onRefreshDevices={() => void loadOutputDevices()}
        />
      }
      dock={
        <PlaybackDock
          playback={playback}
          validatedFile={validatedFile}
          isPlaybackAvailable={isPlaybackAvailable}
          isTransportCommandPending={isTransportCommandPending}
          isSeekPending={seekController.isSeekPending}
          pendingTransportCommand={pendingTransportCommand}
          seekPreviewMs={seekController.seekPreviewMs}
          volumeValue={volumeController.volumeValue}
          isVolumePending={volumeController.isVolumePending}
          isVolumeSliderDisabled={volumeController.isVolumeSliderDisabled}
          playbackError={playbackError}
          presentationTitle={activeTrack.title}
          presentationArtist={activeTrack.artist}
          artworkUrl={activeTrack.artworkUrl}
          artworkLoading={activeTrack.artworkLoading}
          onPlay={() => requestTransport("playing")}
          onPause={() => requestTransport("paused")}
          onResume={() => requestTransport("playing")}
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

function formatStartError(
  code:
    | Parameters<typeof formatPlaybackFailure>[0]
    | "validationFailed"
    | "outputFailed"
    | "playbackWorkerUnavailable"
    | "taskFailed"
    | "decodeFailed",
) {
  switch (code) {
    case "validationFailed":
      return "The file is no longer valid.";
    case "outputFailed":
      return "The audio output could not play this file.";
    case "playbackWorkerUnavailable":
      return "The playback service is unavailable.";
    case "taskFailed":
      return "The playback task failed.";
    case "decodeFailed":
      return "The audio file could not be decoded.";
    default:
      return formatPlaybackFailure(code);
  }
}

function formatTransportError(command: TransportCommand, error: unknown): string {
  switch (command) {
    case "start":
      return isStartAudioFileError(error)
        ? formatStartError(error.code)
        : "An unexpected playback error occurred.";
    case "stop":
      return "The playback service is unavailable.";
    case "pause":
      return isPauseAudioPlaybackError(error) && error.code === "invalidPlaybackState"
        ? "Playback cannot be paused in its current state."
        : "The playback could not be paused.";
    case "resume":
      return isResumeAudioPlaybackError(error) && error.code === "invalidPlaybackState"
        ? "Playback cannot be resumed in its current state."
        : "The playback could not be resumed.";
  }
}

export default App;
