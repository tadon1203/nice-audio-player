import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type {
  AudioFileValidationError,
  AudioFileValidationErrorCode,
  AudioFileInfo,
  PauseAudioPlaybackError,
  PlaybackFailureCode,
  PlaybackSnapshot,
  ResumeAudioPlaybackError,
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

const playbackFailureCodes: ReadonlySet<PlaybackFailureCode> = new Set([
  "noOutputDevice",
  "unsupportedOutputConfiguration",
  "outputStreamBuildFailed",
  "outputStreamStartFailed",
  "outputStreamPauseFailed",
  "outputStreamResumeFailed",
  "outputStreamRuntimeFailed",
  "completionTimingFailed",
]);

const invalidPlaybackSnapshotMessage = "Invalid playback snapshot payload.";

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  return invoke<ValidatedAudioFile>("validate_audio_file", { path });
}

export async function inspectAudioFile(path: string): Promise<AudioFileInfo> {
  return invoke<AudioFileInfo>("inspect_audio_file", { path });
}

export async function startAudioFile(path: string): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(invoke<unknown>("start_audio_file", { path }));
}

export async function stopAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(invoke<unknown>("stop_audio_playback"));
}

export async function pauseAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(invoke<unknown>("pause_audio_playback"));
}

export async function resumeAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(invoke<unknown>("resume_audio_playback"));
}

export async function getPlaybackState(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(invoke<unknown>("get_playback_state"));
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

export function isPauseAudioPlaybackError(value: unknown): value is PauseAudioPlaybackError {
  return isPlaybackControlError(value);
}

export function isResumeAudioPlaybackError(value: unknown): value is ResumeAudioPlaybackError {
  return isPlaybackControlError(value);
}

export function isPlaybackSnapshot(value: unknown): value is PlaybackSnapshot {
  if (typeof value !== "object" || value === null || !("status" in value)) return false;
  if (value.status === "stopped") return true;
  if (value.status === "playing") return isTimedPlaybackSnapshot(value);
  if (value.status === "paused") return isTimedPlaybackSnapshot(value);
  return (
    value.status === "failed" &&
    "error" in value &&
    typeof value.error === "string" &&
    playbackFailureCodes.has(value.error as PlaybackFailureCode) &&
    (!("playbackId" in value) || typeof value.playbackId === "string")
  );
}

function isTimedPlaybackSnapshot(
  value: Record<string, unknown>,
): value is { playbackId: string; positionMs: number; durationMs: number } {
  return (
    typeof value.playbackId === "string" &&
    isValidTimingValue(value.positionMs) &&
    isValidTimingValue(value.durationMs) &&
    value.positionMs <= value.durationMs
  );
}

function isValidTimingValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlaybackControlError(
  value: unknown,
): value is PauseAudioPlaybackError | ResumeAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value.code === "playbackWorkerUnavailable" ||
      value.code === "invalidPlaybackState" ||
      value.code === "outputFailed" ||
      value.code === "taskFailed")
  );
}

async function readPlaybackSnapshot(payload: Promise<unknown>): Promise<PlaybackSnapshot> {
  const value = await payload;
  if (!isPlaybackSnapshot(value)) {
    throw new Error(invalidPlaybackSnapshotMessage);
  }
  return value;
}
