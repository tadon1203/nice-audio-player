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
  isPlaybackMuteError,
  isResumeAudioPlaybackError,
  isSeekAudioPlaybackError,
  isSetPlaybackVolumeError,
  isStartAudioFileError,
  listenToPlaybackState,
  muteAudioPlayback,
  pauseAudioPlayback,
  resumeAudioPlayback,
  seekAudioPlayback,
  setPlaybackVolume,
  startAudioFile,
  stopAudioPlayback,
  unmuteAudioPlayback,
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
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [positionDraft, setPositionDraft] = useState(0);
  const [isSeekPending, setIsSeekPending] = useState(false);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(100);
  const [isVolumePending, setIsVolumePending] = useState(false);
  const volumeAdjustingRef = useRef(false);
  const volumePendingRef = useRef(false);
  const latestPlaybackRef = useRef(playback);
  const readyFileRef = useRef(validatedFile);
  const connectionRef = useRef(playbackUi.connection);
  const connectionHealthyRef = useRef(true);
  const transportPendingRef = useRef(false);
  const queuedTransportIntentRef = useRef<TransportIntent | null>(null);
  const seekPendingRef = useRef(false);
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

  const applySnapshot = useCallback((snapshot: PlaybackSnapshot) => {
    if (snapshot.revision <= latestPlaybackRef.current.revision) return false;
    latestPlaybackRef.current = snapshot;
    dispatchPlaybackUi({ type: "snapshotReceived", snapshot });
    if (!volumeAdjustingRef.current && !volumePendingRef.current) {
      setVolumeDraft(Math.round(snapshot.volume * 100));
    }
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

  function updateSeek(value: number) {
    setIsScrubbing(true);
    setPositionDraft(value);
  }
  async function commitSeek(value: number) {
    const current = latestPlaybackRef.current;
    if (
      (current.status !== "playing" && current.status !== "paused") ||
      current.durationMs === null ||
      transportPendingRef.current ||
      outputSelectionPendingRef.current ||
      seekPendingRef.current ||
      connectionRef.current !== "ready"
    ) {
      setIsScrubbing(false);
      return;
    }
    const target = Math.max(0, Math.min(value, current.durationMs));
    setIsScrubbing(false);
    seekPendingRef.current = true;
    setIsSeekPending(true);
    dispatchPlaybackUi({ type: "commandStarted", lane: "seek" });
    try {
      applySnapshot(await seekAudioPlayback(target));
      setPositionDraft(target);
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "seek" });
    } catch (error: unknown) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "seek",
        message: isSeekAudioPlaybackError(error)
          ? "The playback position could not be changed."
          : "An unexpected playback error occurred.",
      });
      await refreshAuthoritativeSnapshot();
    } finally {
      seekPendingRef.current = false;
      setIsSeekPending(false);
    }
  }

  function beginVolume() {
    volumeAdjustingRef.current = true;
    setIsAdjustingVolume(true);
    setVolumeDraft(Math.round(playback.volume * 100));
  }
  function updateVolume(value: number) {
    volumeAdjustingRef.current = true;
    setIsAdjustingVolume(true);
    setVolumeDraft(value);
  }
  function cancelVolume() {
    volumeAdjustingRef.current = false;
    setIsAdjustingVolume(false);
    setVolumeDraft(Math.round(playback.volume * 100));
  }
  async function commitVolume(value: number) {
    if (volumePendingRef.current || connectionRef.current !== "ready") return;
    const target = Math.max(0, Math.min(100, Math.round(value)));
    volumeAdjustingRef.current = false;
    setIsAdjustingVolume(false);
    volumePendingRef.current = true;
    setIsVolumePending(true);
    dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
    try {
      const snapshot = await setPlaybackVolume(target / 100);
      if (applySnapshot(snapshot)) setVolumeDraft(Math.round(snapshot.volume * 100));
      dispatchPlaybackUi({ type: "commandSucceeded", lane: "volume" });
    } catch (error: unknown) {
      dispatchPlaybackUi({
        type: "commandFailed",
        lane: "volume",
        message:
          isSetPlaybackVolumeError(error) && error.code === "invalidVolume"
            ? "The playback volume is invalid."
            : "The playback volume could not be changed.",
      });
      await refreshAuthoritativeSnapshot();
      setVolumeDraft(Math.round(latestPlaybackRef.current.volume * 100));
    } finally {
      volumePendingRef.current = false;
      setIsVolumePending(false);
    }
  }

  async function toggleMute() {
    if (volumePendingRef.current || connectionRef.current !== "ready") return;
    volumePendingRef.current = true;
    setIsVolumePending(true);
    dispatchPlaybackUi({ type: "commandStarted", lane: "volume" });
    try {
      const current = latestPlaybackRef.current;
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
      volumePendingRef.current = false;
      setIsVolumePending(false);
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
        />
      }
      dock={
        <PlaybackDock
          playback={playback}
          validatedFile={validatedFile}
          outputDevices={outputDevices}
          isLoadingDevices={isLoadingDevices}
          isOutputSelectionPending={isOutputSelectionPending}
          isPlaybackAvailable={isPlaybackAvailable}
          isTransportCommandPending={isTransportCommandPending}
          isSeekPending={isSeekPending}
          pendingTransportCommand={pendingTransportCommand}
          isScrubbing={isScrubbing}
          positionDraft={positionDraft}
          isAdjustingVolume={isAdjustingVolume}
          volumeDraft={volumeDraft}
          isVolumePending={isVolumePending}
          playbackError={playbackError}
          deviceListError={deviceListError}
          onPlay={() => requestTransport("playing")}
          onPause={() => requestTransport("paused")}
          onResume={() => requestTransport("playing")}
          onStop={() => requestTransport("stopped")}
          onSeek={updateSeek}
          onSeekCommit={(value) => void commitSeek(value)}
          onSeekCancel={() => {
            setIsScrubbing(false);
            setPositionDraft(
              playback.status === "playing" || playback.status === "paused"
                ? playback.positionMs
                : 0,
            );
          }}
          onVolumeChange={updateVolume}
          onVolumePointerDown={beginVolume}
          onVolumeCommit={(value) => void commitVolume(value)}
          onVolumePointerCancel={cancelVolume}
          onMuteToggle={() => void toggleMute()}
          onOutputSelectionChange={(selection) => void changeOutputSelection(selection)}
          onRefreshDevices={() => void loadOutputDevices()}
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
