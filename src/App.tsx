import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";

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
  }
}

function App() {
  const [validatedFile, setValidatedFile] = useState<ValidatedAudioFile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [deviceListError, setDeviceListError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isOutputSelectionPending, setIsOutputSelectionPending] = useState(false);
  const [isPlaybackInitializing, setIsPlaybackInitializing] = useState(true);
  const [playback, setPlayback] = useState<PlaybackSnapshot>({
    status: "stopped",
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
  });
  const [pendingTransportCommand, setPendingTransportCommand] =
    useState<PendingTransportCommand>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [positionDraft, setPositionDraft] = useState(0);
  const [isSeekPending, setIsSeekPending] = useState(false);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(100);
  const [isVolumePending, setIsVolumePending] = useState(false);
  const volumeAdjustingRef = useRef(false);
  const volumePendingRef = useRef(false);

  const isTransportCommandPending = pendingTransportCommand !== null;
  const isAudioCommandPending = isTransportCommandPending || isOutputSelectionPending;
  const isTimedPlayback = playback.status === "playing" || playback.status === "paused";

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initializePlaybackState() {
      try {
        const registeredUnsubscribe = await listenToPlaybackState((snapshot) => {
          if (!active) return;
          setPlayback(snapshot);
          if (snapshot.status === "failed") setPlaybackError(formatPlaybackFailure(snapshot.error));
          if (!volumeAdjustingRef.current && !volumePendingRef.current)
            setVolumeDraft(Math.round(snapshot.volume * 100));
        });
        if (!active) {
          registeredUnsubscribe();
          return;
        }
        unsubscribe = registeredUnsubscribe;
        const snapshot = await getPlaybackState();
        if (active) {
          setPlayback(snapshot);
          setVolumeDraft(Math.round(snapshot.volume * 100));
          setIsPlaybackInitializing(false);
        }
      } catch {
        if (active) {
          setPlaybackError("The playback state could not be read.");
          setIsPlaybackInitializing(false);
        }
      }
    }
    void initializePlaybackState();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    void loadOutputDevices();
  }, []);

  async function selectAudioFile() {
    if (isValidatingFile || isTransportCommandPending || isTimedPlayback) return;
    const result = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "m4a", "aac"] }],
    });
    if (typeof result !== "string") return;
    setValidationError(null);
    setPlaybackError(null);
    setIsValidatingFile(true);
    try {
      setValidatedFile(await validateAudioFile(result));
    } catch (error: unknown) {
      setValidatedFile(null);
      setValidationError(formatValidationError(error));
    } finally {
      setIsValidatingFile(false);
    }
  }

  async function playSelectedAudioFile() {
    if (validatedFile === null || isAudioCommandPending) return;
    setPendingTransportCommand("start");
    setPlaybackError(null);
    try {
      setPlayback(await startAudioFile(validatedFile.path));
    } catch (error: unknown) {
      setPlaybackError(
        isStartAudioFileError(error)
          ? formatStartError(error.code)
          : "An unexpected playback error occurred.",
      );
    } finally {
      setPendingTransportCommand(null);
    }
  }

  async function stopPlayback() {
    if (isAudioCommandPending) return;
    setPendingTransportCommand("stop");
    setPlaybackError(null);
    try {
      setPlayback(await stopAudioPlayback());
    } catch {
      setPlaybackError("The playback service is unavailable.");
    } finally {
      setPendingTransportCommand(null);
    }
  }

  async function pausePlayback() {
    if (isAudioCommandPending) return;
    setPendingTransportCommand("pause");
    setPlaybackError(null);
    try {
      setPlayback(await pauseAudioPlayback());
    } catch (error: unknown) {
      setPlaybackError(
        isPauseAudioPlaybackError(error) && error.code === "invalidPlaybackState"
          ? "Playback cannot be paused in its current state."
          : "The playback could not be paused.",
      );
    } finally {
      setPendingTransportCommand(null);
    }
  }

  async function resumePlayback() {
    if (isAudioCommandPending) return;
    setPendingTransportCommand("resume");
    setPlaybackError(null);
    try {
      setPlayback(await resumeAudioPlayback());
    } catch (error: unknown) {
      setPlaybackError(
        isResumeAudioPlaybackError(error) && error.code === "invalidPlaybackState"
          ? "Playback cannot be resumed in its current state."
          : "The playback could not be resumed.",
      );
    } finally {
      setPendingTransportCommand(null);
    }
  }

  async function loadOutputDevices() {
    setIsLoadingDevices(true);
    setDeviceListError(null);
    try {
      setOutputDevices(await listAudioOutputDevices());
    } catch (error: unknown) {
      setOutputDevices(null);
      setDeviceListError(
        isAudioDeviceListError(error)
          ? "Audio output devices could not be enumerated."
          : "An unexpected error occurred while listing audio devices.",
      );
    } finally {
      setIsLoadingDevices(false);
    }
  }

  async function changeOutputSelection(selection: AudioOutputSelection) {
    if (isAudioCommandPending || isLoadingDevices || isTimedPlayback) return;
    setIsOutputSelectionPending(true);
    setPlaybackError(null);
    try {
      setPlayback(await setAudioOutputSelection(selection));
    } catch (error: unknown) {
      if (isSetAudioOutputSelectionError(error) && error.code === "outputDeviceUnavailable") {
        setPlaybackError("The selected output device is unavailable.");
        await loadOutputDevices();
      } else if (isSetAudioOutputSelectionError(error) && error.code === "invalidPlaybackState")
        setPlaybackError("Stop playback before changing the output device.");
      else setPlaybackError("The output device could not be changed.");
      try {
        setPlayback(await getPlaybackState());
      } catch {
        /* Preserve the authoritative snapshot. */
      }
    } finally {
      setIsOutputSelectionPending(false);
    }
  }

  function updateSeek(value: number) {
    setIsScrubbing(true);
    setPositionDraft(value);
  }
  async function commitSeek(value: number) {
    if (
      !isTimedPlayback ||
      playback.durationMs === null ||
      isAudioCommandPending ||
      isSeekPending
    ) {
      setIsScrubbing(false);
      return;
    }
    const target = Math.max(0, Math.min(value, playback.durationMs));
    setIsScrubbing(false);
    setIsSeekPending(true);
    setPlaybackError(null);
    try {
      setPlayback(await seekAudioPlayback(target));
      setPositionDraft(target);
    } catch (error: unknown) {
      setPlaybackError(
        isSeekAudioPlaybackError(error)
          ? "The playback position could not be changed."
          : "An unexpected playback error occurred.",
      );
      try {
        setPlayback(await getPlaybackState());
      } catch {
        /* Preserve the authoritative snapshot. */
      }
    } finally {
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
    const target = Math.max(0, Math.min(100, Math.round(value)));
    volumeAdjustingRef.current = false;
    setIsAdjustingVolume(false);
    volumePendingRef.current = true;
    setIsVolumePending(true);
    setPlaybackError(null);
    try {
      const snapshot = await setPlaybackVolume(target / 100);
      setPlayback(snapshot);
      setVolumeDraft(Math.round(snapshot.volume * 100));
    } catch (error: unknown) {
      setPlaybackError(
        isSetPlaybackVolumeError(error) && error.code === "invalidVolume"
          ? "The playback volume is invalid."
          : "The playback volume could not be changed.",
      );
      try {
        const snapshot = await getPlaybackState();
        setPlayback(snapshot);
        setVolumeDraft(Math.round(snapshot.volume * 100));
      } catch {
        /* Preserve the authoritative snapshot. */
      }
    } finally {
      volumePendingRef.current = false;
      setIsVolumePending(false);
    }
  }

  async function toggleMute() {
    if (isVolumePending) return;
    volumePendingRef.current = true;
    setIsVolumePending(true);
    setPlaybackError(null);
    try {
      setPlayback(await (playback.muted ? unmuteAudioPlayback() : muteAudioPlayback()));
    } catch (error: unknown) {
      setPlaybackError(
        isPlaybackMuteError(error)
          ? "The playback mute state could not be changed."
          : "An unexpected playback error occurred.",
      );
      try {
        setPlayback(await getPlaybackState());
      } catch {
        /* Preserve the authoritative snapshot. */
      }
    } finally {
      volumePendingRef.current = false;
      setIsVolumePending(false);
    }
  }

  const statusMessage = isPlaybackInitializing
    ? "Loading playback state…"
    : isValidatingFile
      ? "Validating audio file…"
      : pendingTransportCommand === "start"
        ? "Starting playback…"
        : pendingTransportCommand === "pause"
          ? "Pausing playback…"
          : pendingTransportCommand === "resume"
            ? "Resuming playback…"
            : pendingTransportCommand === "stop"
              ? "Stopping playback…"
              : isSeekPending
                ? "Updating playback position…"
                : isVolumePending
                  ? "Updating volume…"
                  : isOutputSelectionPending
                    ? "Changing output device…"
                    : playback.status === "playing"
                      ? "Playing"
                      : playback.status === "paused"
                        ? "Paused"
                        : "";
  const isFileSelectionDisabled =
    isPlaybackInitializing || isValidatingFile || isTransportCommandPending || isTimedPlayback;

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
          isTransportCommandPending={isTransportCommandPending || isPlaybackInitializing}
          isSeekPending={isSeekPending}
          pendingTransportCommand={pendingTransportCommand}
          isScrubbing={isScrubbing}
          positionDraft={positionDraft}
          isAdjustingVolume={isAdjustingVolume}
          volumeDraft={volumeDraft}
          isVolumePending={isVolumePending}
          statusMessage={statusMessage}
          playbackError={playbackError}
          deviceListError={deviceListError}
          onPlay={() => void playSelectedAudioFile()}
          onPause={() => void pausePlayback()}
          onResume={() => void resumePlayback()}
          onStop={() => void stopPlayback()}
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

export default App;
