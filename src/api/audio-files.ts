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
  SetPlaybackVolumeError,
  PlaybackMuteError,
  AudioOutputSelection,
  AudioOutputDeviceIdentity,
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
  noOutputDevice: true,
  outputDeviceUnavailable: true,
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
  outputDeviceUnavailable: true,
  unsupportedOutputConfiguration: true,
  outputStreamBuildFailed: true,
  outputStreamStartFailed: true,
  outputStreamPauseFailed: true,
  outputStreamResumeFailed: true,
  outputStreamRuntimeFailed: true,
  completionTimingFailed: true,
  decodeFailed: true,
  sampleRateConversionFailed: true,
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

const setPlaybackVolumeErrorCodes = {
  invalidVolume: true,
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<SetPlaybackVolumeError["code"], true>;

const playbackMuteErrorCodes = {
  playbackWorkerUnavailable: true,
  taskFailed: true,
} satisfies Record<PlaybackMuteError["code"], true>;

const invalidPlaybackSnapshotMessage = "Invalid playback snapshot payload.";

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  const file: unknown = await commands.validateAudioFile(path);
  if (!isValidatedAudioFile(file)) throw new Error("Invalid validated audio file payload.");
  return file;
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

export async function setPlaybackVolume(volume: number): Promise<PlaybackSnapshot> {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new Error("Playback volume must be a finite number between 0 and 1.");
  }
  return readPlaybackSnapshot(commands.setPlaybackVolume(volume));
}

export async function muteAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.muteAudioPlayback());
}

export async function unmuteAudioPlayback(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.unmuteAudioPlayback());
}

export async function getPlaybackState(): Promise<PlaybackSnapshot> {
  return readPlaybackSnapshot(commands.getPlaybackState());
}

export async function listenToPlaybackState(
  handler: (snapshot: PlaybackSnapshot) => void,
  invalidPayloadHandler?: () => void,
): Promise<() => void> {
  return listen<unknown>("playback-state-changed", (event) => {
    if (isPlaybackSnapshot(event.payload)) handler(event.payload);
    else invalidPayloadHandler?.();
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

export function isSetPlaybackVolumeError(value: unknown): value is SetPlaybackVolumeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(setPlaybackVolumeErrorCodes, value.code)
  );
}

export function isPlaybackMuteError(value: unknown): value is PlaybackMuteError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    hasOwn(playbackMuteErrorCodes, value.code)
  );
}

export function isPlaybackSnapshot(value: unknown): value is PlaybackSnapshot {
  if (typeof value !== "object" || value === null || !("status" in value)) return false;
  const record = value as Record<string, unknown>;
  if (!isValidRevision(record.revision) || !isValidOptionalAudioFile(record.file)) return false;
  if (!isValidVolumeState(record)) return false;
  if (!isValidOutputSelection(record.outputSelection)) return false;
  if (record.status === "stopped") return true;
  if (record.status === "playing")
    return isValidatedAudioFile(record.file) && isTimedPlaybackSnapshot(record);
  if (record.status === "paused")
    return isValidatedAudioFile(record.file) && isTimedPlaybackSnapshot(record);
  return (
    record.status === "failed" &&
    typeof record.error === "string" &&
    hasOwn(playbackFailureCodes, record.error) &&
    (!("playbackId" in record) ||
      record.playbackId === null ||
      typeof record.playbackId === "string")
  );
}

function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidOptionalAudioFile(value: unknown): value is ValidatedAudioFile | null {
  return value === null || isValidatedAudioFile(value);
}

export function isValidatedAudioFile(value: unknown): value is ValidatedAudioFile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === "string" &&
    record.path.length > 0 &&
    typeof record.fileName === "string" &&
    record.fileName.length > 0 &&
    typeof record.extension === "string" &&
    record.extension.length > 0
  );
}

function isTimedPlaybackSnapshot(value: Record<string, unknown>): value is {
  playbackId: string;
  positionMs: number;
  durationMs: number | null;
  channelConversion: "none" | "monoToStereo" | "stereoToMono";
  sourceSampleRate: number;
  outputSampleRate: number;
  resamplingActive: boolean;
} {
  return (
    typeof value.playbackId === "string" &&
    isValidTimingValue(value.positionMs) &&
    isValidOutputDeviceIdentity(value.outputDevice) &&
    (value.channelConversion === "none" ||
      value.channelConversion === "monoToStereo" ||
      value.channelConversion === "stereoToMono") &&
    isValidSampleRate(value.sourceSampleRate) &&
    isValidSampleRate(value.outputSampleRate) &&
    value.resamplingActive === (value.sourceSampleRate !== value.outputSampleRate) &&
    (value.durationMs === null ||
      (isValidTimingValue(value.durationMs) && value.positionMs <= value.durationMs))
  );
}

function isValidSampleRate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidOutputSelection(value: unknown): value is AudioOutputSelection {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  if (value.kind === "systemDefault") return !hasOwn(value, "deviceId");
  return (
    value.kind === "device" &&
    "deviceId" in value &&
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0
  );
}

function isValidOutputDeviceIdentity(value: unknown): value is AudioOutputDeviceIdentity {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0
  );
}

function isValidVolumeState(value: Record<string, unknown>): value is Record<string, unknown> & {
  volume: number;
  muted: boolean;
} {
  return (
    typeof value.volume === "number" &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1 &&
    typeof value.muted === "boolean"
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
