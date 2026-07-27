import { invoke } from "@tauri-apps/api/core";

import type {
  AudioFileValidationError,
  AudioFileValidationErrorCode,
  AudioFileInfo,
  PlayAudioFileError,
  ValidatedAudioFile,
} from "@/types/audio-files";

const validationErrorCodes: ReadonlySet<AudioFileValidationErrorCode> = new Set([
  "emptyPath",
  "notFound",
  "notAFile",
  "unsupportedExtension",
  "invalidFileName",
]);

const playAudioFileErrorCodes: ReadonlySet<PlayAudioFileError["code"]> = new Set([
  "validationFailed",
  "decodeFailed",
  "outputFailed",
  "taskFailed",
]);

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  return invoke<ValidatedAudioFile>("validate_audio_file", { path });
}

export async function inspectAudioFile(path: string): Promise<AudioFileInfo> {
  return invoke<AudioFileInfo>("inspect_audio_file", { path });
}

export async function playAudioFile(path: string): Promise<void> {
  return invoke<void>("play_audio_file", { path });
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

export function isPlayAudioFileError(value: unknown): value is PlayAudioFileError {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    playAudioFileErrorCodes.has(value.code as PlayAudioFileError["code"])
  );
}
