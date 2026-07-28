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

export type AudioCodec =
  "aac" | "adpcm" | "alac" | "flac" | "mp1" | "mp2" | "mp3" | "pcm" | "vorbis" | "other";

export interface AudioFileInfo {
  codec: AudioCodec;
  sampleRate: number;
  channelCount: number;
  durationMs: number | null;
}

export type AudioFileInspectionError =
  | { code: "validationFailed"; error: AudioFileValidationError }
  | { code: "fileOpenFailed" }
  | { code: "unsupportedFormat" }
  | { code: "missingAudioTrack" }
  | { code: "missingCodecParameters" }
  | { code: "unsupportedCodec" }
  | { code: "missingSampleRate" }
  | { code: "missingChannelCount" }
  | { code: "invalidChannelCount" }
  | { code: "corruptedFile" };

export type PlaybackFailureCode =
  | "noOutputDevice"
  | "unsupportedOutputConfiguration"
  | "outputStreamBuildFailed"
  | "outputStreamStartFailed"
  | "outputStreamRuntimeFailed"
  | "completionTimingFailed"
  | "playbackWorkerUnavailable";

export type PlaybackSnapshot =
  | { status: "stopped" }
  | { status: "playing"; playbackId: string }
  | { status: "failed"; playbackId?: string; error: PlaybackFailureCode };

export type StartAudioFileError =
  | { code: "validationFailed"; error: AudioFileValidationError }
  | { code: "decodeFailed" }
  | { code: "outputFailed" }
  | { code: "playbackWorkerUnavailable" }
  | { code: "taskFailed" };

export type StopAudioPlaybackError = { code: "playbackWorkerUnavailable" } | { code: "taskFailed" };
