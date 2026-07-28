import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

import { isAudioDeviceListError, listAudioOutputDevices } from "@/api/audio-devices";
import {
  isAudioFileValidationError,
  getPlaybackState,
  isStartAudioFileError,
  listenToPlaybackState,
  startAudioFile,
  stopAudioPlayback,
  validateAudioFile,
} from "@/api/audio-files";
import type { AudioOutputDevice } from "@/types/audio-devices";
import type { PlaybackSnapshot, ValidatedAudioFile } from "@/types/audio-files";

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

function App() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedAudioFile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[] | null>(null);
  const [deviceListError, setDeviceListError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [playback, setPlayback] = useState<PlaybackSnapshot>({ status: "stopped" });
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      unsubscribe = await listenToPlaybackState((snapshot) => {
        if (active) setPlayback(snapshot);
      });
      const snapshot = await getPlaybackState();
      if (active) setPlayback(snapshot);
    })();
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
    if (validatedFile === null || isStarting) {
      return;
    }

    setIsStarting(true);
    setPlaybackError(null);

    try {
      setPlayback(await startAudioFile(validatedFile.path));
    } catch (error: unknown) {
      if (!isStartAudioFileError(error)) {
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
      setIsStarting(false);
    }
  }

  async function stopPlayback(): Promise<void> {
    setIsStopping(true);
    setPlaybackError(null);
    try {
      setPlayback(await stopAudioPlayback());
    } catch {
      setPlaybackError("The playback service is unavailable.");
    } finally {
      setIsStopping(false);
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
          disabled={validatedFile === null || isStarting}
          className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStarting ? "Starting..." : "Play"}
        </button>

        {playback.status === "playing" ? (
          <button
            type="button"
            onClick={() => void stopPlayback()}
            disabled={isStopping}
            className="ml-3 rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:opacity-60"
          >
            {isStopping ? "Stopping..." : "Stop"}
          </button>
        ) : null}
        <p className="mt-4 text-sm text-zinc-400" role="status">
          Playback: {playback.status}
          {playback.status === "playing" ? ` (${playback.playbackId})` : ""}
        </p>

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
