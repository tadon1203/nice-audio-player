import type { CommandError, PlaybackFailureCode } from "./bindings";

/** Why playback stopped by itself, as the dock shows the listener. */
export const outputFailureMessages = {
  noOutputDevice: "No audio output device is available.",
  outputDeviceUnavailable: "The audio output device is unavailable.",
  unsupportedOutput: "The output device configuration is unsupported.",
  outputFailed: "The audio output failed.",
  decodeFailed: "The audio file could not be decoded.",
} as const satisfies Record<PlaybackFailureCode, string>;

/** The text for each code a command can reject with. */
const messages = {
  notFound: "That item could not be found.",
  trackUnavailable: "That track is unavailable on disk.",
  libraryUnavailable: "The library is unavailable.",
  invalidDirectory: "That directory reference is invalid.",
  duplicateDirectory: "That directory is already in the library.",
  overlappingDirectory: "That directory overlaps an existing library directory.",
  directoryContainsDataDirectory:
    "That directory contains the app's own data, so it cannot be a library directory.",
  internal: "Something went wrong. Try again.",
} as const satisfies Record<CommandError["code"], string>;

/** The user-facing text for a failed Backend call. */
export function errorMessage(error: CommandError): string {
  return messages[error.code];
}
