import { invoke } from "@tauri-apps/api/core";

import type {
  AudioFileValidationError,
  AudioFileValidationErrorCode,
  ValidatedAudioFile,
} from "@/types/audio-files";

const validationErrorCodes: ReadonlySet<AudioFileValidationErrorCode> = new Set([
  "emptyPath",
  "notFound",
  "notAFile",
  "unsupportedExtension",
  "invalidFileName",
]);

export async function validateAudioFile(path: string): Promise<ValidatedAudioFile> {
  return invoke<ValidatedAudioFile>("validate_audio_file", { path });
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
