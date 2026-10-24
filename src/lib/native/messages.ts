import type { CommandError, PlaybackFailureCode } from "./bindings";
import { NativeError } from "./errors";

/** Why playback stopped by itself, as the dock and an `output` rejection tell the listener. */
export const outputFailureMessages = {
  noOutputDevice: "No audio output device is available.",
  outputDeviceUnavailable: "The audio output device is unavailable.",
  unsupportedOutputConfiguration: "The output device configuration is unsupported.",
  outputStreamBuildFailed: "The audio output could not be prepared.",
  outputStreamStartFailed: "The audio output could not be started.",
  outputStreamPauseFailed: "The audio output could not be paused.",
  outputStreamResumeFailed: "The audio output could not be resumed.",
  outputStreamRuntimeFailed: "The audio output stopped unexpectedly.",
  completionTimingFailed: "Playback completion could not be determined.",
  decodeFailed: "The audio file could not be decoded.",
  sampleRateConversionFailed: "The audio could not be converted.",
} as const satisfies Record<PlaybackFailureCode, string>;

/** The text for each code a command can reject with. `output` is shown from outputFailureMessages. */
const messages = {
  trackNotFound: "That track could not be found.",
  trackUnavailable: "That track is unavailable on disk.",
  libraryUnavailable: "The library is unavailable.",
  persistenceFailed: "The library database could not be updated.",
  taskFailed: "The request did not finish. Try again.",
  invalidDirectory: "That directory reference is invalid.",
  directoryNotDirectory: "The selected path is not a directory.",
  duplicateDirectory: "That directory is already in the library.",
  overlappingDirectory: "That directory overlaps an existing library directory.",
  directoryContainsDataDirectory:
    "That directory contains the app's own data, so it cannot be a library directory.",
  directoryMissing: "A library directory is missing from disk.",
  albumNotFound: "That album could not be found.",
  artistNotFound: "That artist could not be found.",
  scanAlreadyRunning: "A library scan is already running.",
  scanNotRunning: "No library scan is running.",
  noEnabledDirectories: "Enable at least one library directory before scanning.",
  superseded: "That request was replaced by a newer one.",
  queueItemNotFound: "That item is no longer in the queue.",
  queueBusy: "The playback queue is busy. Try again.",
  invalidVolume: "That volume level is invalid.",
  invalidPlaybackState: "That action is not available in the current playback state.",
  durationUnavailable: "The track duration is unavailable.",
  seekFailed: "The track could not be repositioned.",
  deviceEnumerationFailed: "The audio output devices could not be listed.",
} as const satisfies Record<Exclude<CommandError["code"], "output">, string>;

const generalMessage = "Something went wrong. Try again.";

/** The user-facing text for any failure. Unknown failures get the general text. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof NativeError)) return generalMessage;
  if (error.error.code === "output") return outputFailureMessages[error.error.failure];
  return messages[error.error.code] ?? generalMessage;
}
