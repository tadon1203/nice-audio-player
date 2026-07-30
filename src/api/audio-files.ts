import { listen } from "@tauri-apps/api/event";

import { commands } from "@/bindings";
import type {
  AudioFileValidationError,
  AudioFileInfo,
  PauseAudioPlaybackError,
  PlaybackFailureCode,
  PlaybackSnapshot,
  ResumeAudioPlaybackError,
  SeekAudioPlaybackError,
  StartAudioFileError,
  StopAudioPlaybackError,
  ValidatedAudioFile,
} from "@/bindings";

const validationErrorCodes = {
  emptyPath: true,
  notFound: true,
  notAFile: true,
  unsupportedExtension: true,
  invalidFileName: true,
} satisfies Record<AudioFileValidationError["code"], true>;

const startAudioFileErrorCodes = {
  validationFailed: true,
  decodeFailed: true,
  outputFailed: true,
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<StartAudioFileError["code"], true>;

const stopAudioPlaybackErrorCodes = {
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<StopAudioPlaybackError["code"], true>;

const pauseAudioPlaybackErrorCodes = {
  playbackWorkerUnavailable: true,
  invalidPlaybackState: true,
  outputFailed: true,
  taskFailed: true,
} satisfies Record<PauseAudioPlaybackError["code"], true>;

const resumeAudioPlaybackErrorCodes = {
  playbackWorkerUnavailable: true,
  invalidPlaybackState: true,
  outputFailed: true,
  taskFailed: true,
} satisfies Record<ResumeAudioPlaybackError["code"], true>;

const playbackFailureCodes = {
  noOutputDevice: true,
  unsupportedOutputConfiguration: true,
  outputStreamBuildFailed: true,
  outputStreamStartFailed: true,
  outputStreamPauseFailed: true,
  outputStreamResumeFailed: true,
  outputStreamRuntimeFailed: true,
  completionTimingFailed: true,
  decodeFailed: true,
} satisfies Record<PlaybackFailureCode, true>;

const seekAudioPlaybackErrorCodes = {
  invalidPlaybackState: true,
  durationUnavailable: true,
  seekFailed: true,
  decodeFailed: true,
  outputFailed: true,
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<SeekAudioPlaybackError["code"], true>;

const invalidPlaybackSnapshotMessage = "Invalid playback snapshot payload.";

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  return commands.validateAudioFile(path);
}

export async function inspectAudioFile(path: string): Promise<AudioFileInfo> {
  return commands.inspectAudioFile(path);
}

export async function startAudioFile(path: string): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.startAudioFile(path));
}

export async function stopAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.stopAudioPlayback());
}

export async function pauseAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.pauseAudioPlayback());
}

export async function resumeAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.resumeAudioPlayback());
}

export async function seekAudioPlayback(positionMs: number): Promise<PlaybackSnapshot> {
  if (!Number.isSafeInteger(positionMs) || positionMs < 0) {
    throw new Error("Playback position must be a non-negative safe integer.");
  }
  return readPlaybackSnapshot(commands.seekAudioPlayback(positionMs));
}

export async function getPlaybackState(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.getPlaybackState());
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

  return typeof value.code === "string" && hasOwn(validationErrorCodes, value.code);
}

export function isStartAudioFileError(value: unknown): value is StartAudioFileError {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return false;
  }

  return typeof value.code === "string" && hasOwn(startAudioFileErrorCodes, value.code);
}

export function isStopAudioPlaybackError(value: unknown): value is StopAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(stopAudioPlaybackErrorCodes, value.code)
  );
}

export function isPauseAudioPlaybackError(value: unknown): value is PauseAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(pauseAudioPlaybackErrorCodes, value.code)
  );
}

export function isResumeAudioPlaybackError(value: unknown): value is ResumeAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(resumeAudioPlaybackErrorCodes, value.code)
  );
}

export function isSeekAudioPlaybackError(value: unknown): value is SeekAudioPlaybackError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(seekAudioPlaybackErrorCodes, value.code)
  );
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
    hasOwn(playbackFailureCodes, value.error) &&
    (!("playbackId" in value) || typeof value.playbackId === "string")
  );
}

function isTimedPlaybackSnapshot(
  value: Record<string, unknown>,
): value is { playbackId: string; positionMs: number; durationMs: number | null } {
  return (
    typeof value.playbackId === "string" &&
    isValidTimingValue(value.positionMs) &&
    (value.durationMs === null ||
      (isValidTimingValue(value.durationMs) && value.positionMs <= value.durationMs))
  );
}

function isValidTimingValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function readPlaybackSnapshot(payload: Promise<unknown>): Promise<PlaybackSnapshot> {
  const value = await payload;
  if (!isPlaybackSnapshot(value)) {
    throw new Error(invalidPlaybackSnapshotMessage);
  }
  return value;
}
