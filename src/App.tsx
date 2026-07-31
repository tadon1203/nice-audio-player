import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";

import {
  isAudioDeviceListError,
  isSetAudioOutputSelectionError,
  listAudioOutputDevices,
  setAudioOutputSelection,
} from "@/api/audio-devices";
import {
  isAudioFileValidationError,
  getPlaybackState,
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  isPlaybackMuteError,
  isSetPlaybackVolumeError,
  isStartAudioFileError,
  listenToPlaybackState,
  pauseAudioPlayback,
  resumeAudioPlayback,
  isSeekAudioPlaybackError,
  seekAudioPlayback,
  setPlaybackVolume,
  muteAudioPlayback,
  unmuteAudioPlayback,
  startAudioFile,
  stopAudioPlayback,
  validateAudioFile,
} from "@/api/audio-files";
import type {
  AudioOutputDevice,
  AudioOutputSelection,
  PlaybackSnapshot,
  ValidatedAudioFile,
} from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";

function formatValidationError(error: unknown): string {
  if (!isAudioFileValidationError(error)) {
    return "The selected file could not be validated.";
  }

  switch (error.code) {
    case "emptyPath":
      return "Select an audio file first.";
    case "notFound":
      return "File not found.";
    case "notAFile":
      return "The selected path is not a file.";
    case "unsupportedExtension": {
      const extension = error.details?.extension;
      return extension
        ? `.${extension} is not currently supported.`
        : "The selected file has no supported extension.";
    }
    case "invalidFileName":
      return "The selected file name is invalid.";
  }
}

type PendingPlaybackCommand = "start" | "stop" | "pause" | "resume" | "seek" | null;

function App() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedAudioFile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [deviceListError, setDeviceListError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isOutputSelectionPending, setIsOutputSelectionPending] = useState(false);
  const [playback, setPlayback] = useState<PlaybackSnapshot>({
    status: "stopped",
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
  });
  const [pendingPlaybackCommand, setPendingPlaybackCommand] =
    useState<PendingPlaybackCommand>(null);
  const isChangingPlaybackState = pendingPlaybackCommand !== null;
  const isAudioCommandPending = isChangingPlaybackState || isOutputSelectionPending;
  const isSeeking = pendingPlaybackCommand === "seek";
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [positionDraft, setPositionDraft] = useState(0);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(100);
  const [isVolumePending, setIsVolumePending] = useState(false);
  const volumeAdjustingRef = useRef(false);
  const volumePendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initializePlaybackState(): Promise<void> {
      try {
        const registeredUnsubscribe = await listenToPlaybackState((snapshot) => {
          if (active) {
            setPlayback(snapshot);
            if (!volumeAdjustingRef.current && !volumePendingRef.current) {
              setVolumeDraft(Math.round((snapshot.volume ?? 0) * 100));
            }
          }
        });
        if (!active) {
          registeredUnsubscribe();
          return;
        }
        unsubscribe = registeredUnsubscribe;
        const snapshot = await getPlaybackState();
        if (active) {
          setPlayback(snapshot);
          setVolumeDraft(Math.round((snapshot.volume ?? 0) * 100));
        }
      } catch {
        if (active) setPlaybackError("The playback state could not be read.");
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

  async function selectAudioFile(): Promise<void> {
    const result = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "flac", "wav", "m4a", "aac"],
        },
      ],
    });

    if (typeof result === "string") {
      setSelectedPath(result);
      setValidatedFile(null);
      setValidationError(null);
      setPlaybackError(null);

      try {
        setValidatedFile(await validateAudioFile(result));
      } catch (error: unknown) {
        setValidationError(formatValidationError(error));
      }
    }
  }

  async function playSelectedAudioFile(): Promise<void> {
    if (validatedFile === null || isAudioCommandPending) {
      return;
    }

    setPendingPlaybackCommand("start");
    setPlaybackError(null);

    try {
      setPlayback(await startAudioFile(validatedFile.path));
    } catch (error: unknown) {
      if (!isStartAudioFileError(error)) {
        console.error("Unexpected playback error", error);
        setPlaybackError("An unexpected playback error occurred.");
      } else {
        switch (error.code) {
          case "validationFailed":
            setPlaybackError("The file is no longer valid.");
            break;
          case "decodeFailed":
            setPlaybackError("The audio file could not be decoded.");
            break;
          case "noOutputDevice":
            setPlaybackError("No system-default audio output device is available.");
            break;
          case "outputDeviceUnavailable":
            setPlaybackError("The selected output device is unavailable.");
            break;
          case "outputFailed":
            setPlaybackError("The audio output could not play this file.");
            break;
          case "playbackWorkerUnavailable":
            setPlaybackError("The playback service is unavailable.");
            break;
          case "taskFailed":
            setPlaybackError("The playback task failed.");
            break;
        }
      }
    } finally {
      setPendingPlaybackCommand(null);
    }
  }

  async function stopPlayback(): Promise<void> {
    if (isAudioCommandPending) return;
    setPendingPlaybackCommand("stop");
    setPlaybackError(null);
    try {
      setPlayback(await stopAudioPlayback());
    } catch {
      setPlaybackError("The playback service is unavailable.");
    } finally {
      setPendingPlaybackCommand(null);
    }
  }

  async function pausePlayback(): Promise<void> {
    if (isAudioCommandPending) return;
    setPendingPlaybackCommand("pause");
    setPlaybackError(null);
    try {
      setPlayback(await pauseAudioPlayback());
    } catch (error: unknown) {
      setPlaybackError(
        isPauseAudioPlaybackError(error)
          ? error.code === "invalidPlaybackState"
            ? "Playback cannot be paused in its current state."
            : "The playback could not be paused."
          : "An unexpected playback error occurred.",
      );
    } finally {
      setPendingPlaybackCommand(null);
    }
  }

  async function resumePlayback(): Promise<void> {
    if (isAudioCommandPending) return;
    setPendingPlaybackCommand("resume");
    setPlaybackError(null);
    try {
      setPlayback(await resumeAudioPlayback());
    } catch (error: unknown) {
      setPlaybackError(
        isResumeAudioPlaybackError(error)
          ? error.code === "invalidPlaybackState"
            ? "Playback cannot be resumed in its current state."
            : "The playback could not be resumed."
          : "An unexpected playback error occurred.",
      );
    } finally {
      setPendingPlaybackCommand(null);
    }
  }

  async function loadOutputDevices(): Promise<void> {
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

  async function changeOutputSelection(selection: AudioOutputSelection): Promise<void> {
    if (
      isAudioCommandPending ||
      playback.status === "playing" ||
      playback.status === "paused" ||
      isLoadingDevices
    ) {
      return;
    }
    setIsOutputSelectionPending(true);
    setPlaybackError(null);
    try {
      setPlayback(await setAudioOutputSelection(selection));
    } catch (error: unknown) {
      if (isSetAudioOutputSelectionError(error)) {
        if (error.code === "outputDeviceUnavailable") {
          setPlaybackError("The selected output device is unavailable.");
          await loadOutputDevices();
        } else if (error.code === "invalidPlaybackState") {
          setPlaybackError("Stop playback before changing the output device.");
          try {
            setPlayback(await getPlaybackState());
          } catch {
            // Keep the existing authoritative snapshot when the refresh fails.
          }
        } else if (error.code === "invalidDeviceId") {
          setPlaybackError("The selected output device is invalid.");
        } else {
          setPlaybackError("The output device could not be changed.");
        }
      } else {
        setPlaybackError("The output device could not be changed.");
      }
    } finally {
      setIsOutputSelectionPending(false);
    }
  }

  async function commitSeek(targetPositionMs: number): Promise<void> {
    if (
      isAudioCommandPending ||
      (playback.status !== "playing" && playback.status !== "paused") ||
      playback.durationMs === null
    ) {
      setIsScrubbing(false);
      return;
    }
    setIsScrubbing(false);
    const target = Math.max(0, Math.min(targetPositionMs, playback.durationMs));
    setPendingPlaybackCommand("seek");
    setPlaybackError(null);
    try {
      setPlayback(await seekAudioPlayback(target));
      setPositionDraft(target);
    } catch (error: unknown) {
      if (isSeekAudioPlaybackError(error)) {
        setPlaybackError(
          error.code === "invalidPlaybackState"
            ? "Playback cannot be seeked in its current state."
            : error.code === "durationUnavailable"
              ? "Playback duration is unavailable."
              : "The playback position could not be changed.",
        );
      } else {
        setPlaybackError("The playback position could not be changed.");
      }
      try {
        setPlayback(await getPlaybackState());
      } catch {
        // Keep the existing authoritative snapshot when the refresh fails.
      }
    } finally {
      setPendingPlaybackCommand(null);
    }
  }

  async function commitVolume(targetPercentage: number): Promise<void> {
    const target = Math.max(0, Math.min(100, Math.round(targetPercentage)));
    volumeAdjustingRef.current = false;
    setIsAdjustingVolume(false);
    volumePendingRef.current = true;
    setIsVolumePending(true);
    setPlaybackError(null);
    try {
      const snapshot = await setPlaybackVolume(target / 100);
      setPlayback(snapshot);
      setIsAdjustingVolume(false);
      setVolumeDraft(Math.round((snapshot.volume ?? 0) * 100));
    } catch (error: unknown) {
      setPlaybackError(
        isSetPlaybackVolumeError(error) && error.code === "invalidVolume"
          ? "The playback volume is invalid."
          : "The playback volume could not be changed.",
      );
      try {
        const snapshot = await getPlaybackState();
        setPlayback(snapshot);
        setVolumeDraft(Math.round((snapshot.volume ?? 0) * 100));
      } catch {
        // Keep the existing authoritative snapshot when the refresh fails.
      }
    } finally {
      volumePendingRef.current = false;
      setIsVolumePending(false);
    }
  }

  async function toggleMute(): Promise<void> {
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
        // Keep the existing authoritative snapshot when the refresh fails.
      }
    } finally {
      volumePendingRef.current = false;
      setIsVolumePending(false);
    }
  }

  const selectedOutputDeviceId =
    playback.outputSelection.kind === "device" ? playback.outputSelection.deviceId : null;

  return (
    <main className="grid h-screen place-items-center bg-zinc-950 p-8 text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm text-zinc-400">Nice Audio Player</p>

        <h1 className="mt-2 text-3xl font-semibold">Audio file selection</h1>

        <button
          type="button"
          onClick={() => void selectAudioFile()}
          className="mt-6 rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-950"
        >
          音楽ファイルを選択
        </button>

        <p className="mt-4 break-all text-sm text-zinc-400">
          {selectedPath ?? "ファイルは選択されていません"}
        </p>

        {validatedFile ? (
          <dl className="mt-4 space-y-1 text-sm text-zinc-300">
            <div>
              <dt className="inline text-zinc-500">File: </dt>
              <dd className="inline">{validatedFile.fileName}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">Extension: </dt>
              <dd className="inline">.{validatedFile.extension}</dd>
            </div>
          </dl>
        ) : null}

        {validationError ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {validationError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void playSelectedAudioFile()}
          disabled={validatedFile === null || isAudioCommandPending}
          className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isChangingPlaybackState ? "Changing..." : "Play"}
        </button>

        {playback.status === "playing" ? (
          <>
            <button
              type="button"
              onClick={() => void pausePlayback()}
              disabled={isAudioCommandPending}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              {isChangingPlaybackState ? "Changing..." : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => void stopPlayback()}
              disabled={isAudioCommandPending}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              Stop
            </button>
          </>
        ) : playback.status === "paused" ? (
          <>
            <button
              type="button"
              onClick={() => void resumePlayback()}
              disabled={isAudioCommandPending}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              {isChangingPlaybackState ? "Changing..." : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => void stopPlayback()}
              disabled={isAudioCommandPending}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              Stop
            </button>
          </>
        ) : null}
        <p className="mt-4 text-sm text-zinc-400" role="status">
          Playback: {playback.status}
          {playback.status === "playing" || playback.status === "paused"
            ? ` (${playback.playbackId})`
            : ""}
        </p>
        {playback.status === "playing" || playback.status === "paused" ? (
          <p className="mt-2 font-mono text-sm text-zinc-300">
            {formatPlaybackTime(isScrubbing || isSeeking ? positionDraft : playback.positionMs)} /{" "}
            {playback.durationMs === null ? "--:--" : formatPlaybackTime(playback.durationMs)}
          </p>
        ) : null}
        {playback.status === "playing" || playback.status === "paused" ? (
          <p className="mt-2 text-sm text-zinc-400">Output device: {playback.outputDevice.name}</p>
        ) : null}

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-zinc-300">
            <label htmlFor="playback-volume">Playback volume</label>
            <span>{Math.round((playback.volume ?? 0) * 100)}%</span>
          </div>
          <input
            id="playback-volume"
            aria-label="Playback volume"
            aria-valuetext={`${isAdjustingVolume ? Math.round(volumeDraft) : Math.round((playback.volume ?? 0) * 100)} percent`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={isAdjustingVolume ? volumeDraft : Math.round((playback.volume ?? 0) * 100)}
            disabled={isVolumePending}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              volumeAdjustingRef.current = true;
              setIsAdjustingVolume(true);
              setVolumeDraft(value);
            }}
            onPointerDown={() => {
              volumeAdjustingRef.current = true;
              setIsAdjustingVolume(true);
              setVolumeDraft(Math.round((playback.volume ?? 0) * 100));
            }}
            onPointerUp={(event) => void commitVolume(Number(event.currentTarget.value))}
            onPointerCancel={() => {
              volumeAdjustingRef.current = false;
              setIsAdjustingVolume(false);
              setVolumeDraft(Math.round((playback.volume ?? 0) * 100));
            }}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "PageUp",
                  "PageDown",
                  "Home",
                  "End",
                ].includes(event.key)
              ) {
                void commitVolume(Number(event.currentTarget.value));
              }
            }}
            className="mt-2 w-full"
          />
          <button
            type="button"
            onClick={() => void toggleMute()}
            disabled={isVolumePending}
            className="mt-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {playback.muted ? "Unmute" : "Mute"}
          </button>
        </div>
        {playback.status === "playing" || playback.status === "paused" ? (
          <label className="mt-4 block text-sm text-zinc-300">
            <span className="sr-only">Playback position</span>
            <input
              aria-label="Playback position"
              type="range"
              min={0}
              max={playback.durationMs ?? 0}
              value={Math.min(
                isScrubbing || isSeeking ? positionDraft : playback.positionMs,
                playback.durationMs ?? 0,
              )}
              disabled={isAudioCommandPending || playback.durationMs === null}
              onChange={(event) => {
                setIsScrubbing(true);
                setPositionDraft(Number(event.currentTarget.value));
              }}
              onPointerDown={() => setIsScrubbing(true)}
              onPointerUp={(event) => void commitSeek(Number(event.currentTarget.value))}
              onPointerCancel={() => {
                setIsScrubbing(false);
                setPositionDraft(playback.positionMs);
              }}
              onKeyUp={(event) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "PageUp",
                    "PageDown",
                    "Home",
                    "End",
                  ].includes(event.key)
                ) {
                  void commitSeek(Number(event.currentTarget.value));
                }
              }}
              className="mt-2 w-full"
            />
          </label>
        ) : null}

        {playbackError ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {playbackError}
          </p>
        ) : null}
        {playback.status === "failed" ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            Playback failed: {playback.error}
          </p>
        ) : null}

        <div className="mt-8 border-t border-zinc-800 pt-6">
          <h2 className="text-lg font-medium">Audio output devices</h2>
          <label className="mt-4 block text-sm text-zinc-300">
            <span>Audio output device</span>
            <select
              aria-label="Audio output device"
              value={
                playback.outputSelection.kind === "systemDefault"
                  ? "systemDefault"
                  : playback.outputSelection.deviceId
              }
              disabled={
                isLoadingDevices ||
                isOutputSelectionPending ||
                isAudioCommandPending ||
                playback.status === "playing" ||
                playback.status === "paused"
              }
              onChange={(event) => {
                const value = event.currentTarget.value;
                void changeOutputSelection(
                  value === "systemDefault"
                    ? { kind: "systemDefault" }
                    : { kind: "device", deviceId: value },
                );
              }}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            >
              <option value="systemDefault">System default</option>
              {selectedOutputDeviceId !== null &&
              !outputDevices?.some((device) => device.id === selectedOutputDeviceId) ? (
                <option value={selectedOutputDeviceId} disabled>
                  Unavailable selected device
                </option>
              ) : null}
              {outputDevices?.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                  {device.isDefault ? " — Current default" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadOutputDevices()}
            disabled={isLoadingDevices}
            className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-wait disabled:opacity-60"
          >
            {isLoadingDevices ? "Loading devices..." : "Refresh devices"}
          </button>

          {deviceListError ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {deviceListError}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default App;
