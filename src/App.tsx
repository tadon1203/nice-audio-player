import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

import { isAudioDeviceListError, listAudioOutputDevices } from "@/api/audio-devices";
import {
  isAudioFileValidationError,
  getPlaybackState,
  isPauseAudioPlaybackError,
  isResumeAudioPlaybackError,
  isStartAudioFileError,
  listenToPlaybackState,
  pauseAudioPlayback,
  resumeAudioPlayback,
  isSeekAudioPlaybackError,
  seekAudioPlayback,
  startAudioFile,
  stopAudioPlayback,
  validateAudioFile,
} from "@/api/audio-files";
import type { AudioOutputDevice, PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
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
  const [playback, setPlayback] = useState<PlaybackSnapshot>({ status: "stopped" });
  const [pendingPlaybackCommand, setPendingPlaybackCommand] =
    useState<PendingPlaybackCommand>(null);
  const isChangingPlaybackState = pendingPlaybackCommand !== null;
  const isSeeking = pendingPlaybackCommand === "seek";
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [positionDraft, setPositionDraft] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initializePlaybackState(): Promise<void> {
      try {
        const registeredUnsubscribe = await listenToPlaybackState((snapshot) => {
          if (active) setPlayback(snapshot);
        });
        if (!active) {
          registeredUnsubscribe();
          return;
        }
        unsubscribe = registeredUnsubscribe;
        const snapshot = await getPlaybackState();
        if (active) setPlayback(snapshot);
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
    if (validatedFile === null || isChangingPlaybackState) {
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
    if (isChangingPlaybackState) return;
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
    if (isChangingPlaybackState) return;
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
    if (isChangingPlaybackState) return;
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

  async function commitSeek(targetPositionMs: number): Promise<void> {
    if (
      isChangingPlaybackState ||
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
          disabled={validatedFile === null || isChangingPlaybackState}
          className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isChangingPlaybackState ? "Changing..." : "Play"}
        </button>

        {playback.status === "playing" ? (
          <>
            <button
              type="button"
              onClick={() => void pausePlayback()}
              disabled={isChangingPlaybackState}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              {isChangingPlaybackState ? "Changing..." : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => void stopPlayback()}
              disabled={isChangingPlaybackState}
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
              disabled={isChangingPlaybackState}
              className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
            >
              {isChangingPlaybackState ? "Changing..." : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => void stopPlayback()}
              disabled={isChangingPlaybackState}
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
              disabled={isChangingPlaybackState || playback.durationMs === null}
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
          <button
            type="button"
            onClick={() => void loadOutputDevices()}
            disabled={isLoadingDevices}
            className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-wait disabled:opacity-60"
          >
            {isLoadingDevices ? "Loading devices..." : "List output devices"}
          </button>

          {outputDevices?.length ? (
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              {outputDevices.map((device) => (
                <li key={device.id}>
                  {device.name}
                  {device.isDefault ? " — Default" : ""}
                </li>
              ))}
            </ul>
          ) : null}

          {outputDevices?.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">No audio output devices were found.</p>
          ) : null}

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
