import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type {
  AudioFileValidationError,
  AudioFileValidationErrorCode,
  AudioFileInfo,
  PlaybackSnapshot,
  StartAudioFileError,
  StopAudioPlaybackError,
  ValidatedAudioFile,
} from "@/types/audio-files";

const validationErrorCodes: ReadonlySet<AudioFileValidationErrorCode> = new Set([
  "emptyPath",
  "notFound",
  "notAFile",
  "unsupportedExtension",
  "invalidFileName",
]);

const startAudioFileErrorCodes: ReadonlySet<StartAudioFileError["code"]> = new Set([
  "validationFailed",
  "decodeFailed",
  "outputFailed",
  "playbackWorkerUnavailable",
  "taskFailed",
]);

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  return invoke<ValidatedAudioFile>("validate_audio_file", { path });
}

export async function inspectAudioFile(path: string): Promise<AudioFileInfo> {
  return invoke<AudioFileInfo>("inspect_audio_file", { path });
}

export async function startAudioFile(path: string): Promise<PlaybackSnapshot> {
  return invoke<PlaybackSnapshot>("start_audio_file", { path });
}

export async function stopAudioPlayback(): Promise<PlaybackSnapshot> {
  return invoke<PlaybackSnapshot>("stop_audio_playback");
}

export async function getPlaybackState(): Promise<PlaybackSnapshot> {
  return invoke<PlaybackSnapshot>("get_playback_state");
}

export async function listenToPlaybackState(
  handler: (snapshot: PlaybackSnapshot) => void,
): Promise<() => void> {
  return listen<unknown>("playback-state-changed", (event) => {
    if (isPlaybackSnapshot(event.payload)) handler(event.payload);
  });
}

export function isAudioFileValidationError(value: unknown): value is AudioFileValidationError {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    validationErrorCodes.has(value.code as AudioFileValidationErrorCode)
  );
}

export function isStartAudioFileError(value: unknown): value is StartAudioFileError {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    startAudioFileErrorCodes.has(value.code as StartAudioFileError["code"])
  );
}

export function isStopAudioPlaybackError(value: unknown): value is StopAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value.code === "playbackWorkerUnavailable" || value.code === "taskFailed")
  );
}

export function isPlaybackSnapshot(value: unknown): value is PlaybackSnapshot {
  if (typeof value !== "object" || value === null || !("status" in value)) return false;
  if (value.status === "stopped") return true;
  if (value.status === "playing")
    return "playbackId" in value && typeof value.playbackId === "string";
  return (
    value.status === "failed" &&
    "error" in value &&
    typeof value.error === "string" &&
    (!("playbackId" in value) || typeof value.playbackId === "string")
  );
}
