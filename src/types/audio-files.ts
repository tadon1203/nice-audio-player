export interface ValidatedAudioFile {
  path: string;
  fileName: string;
  extension: string;
}

export type AudioFileValidationErrorCode =
  "emptyPath" | "notFound" | "notAFile" | "unsupportedExtension" | "invalidFileName";

export interface AudioFileValidationError {
  code: AudioFileValidationErrorCode;
  details?: {
    extension?: string | null;
  };
}
