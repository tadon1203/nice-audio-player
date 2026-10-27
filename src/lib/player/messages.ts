import type { PlaybackFailureCode } from "#lib/native/bindings";

/** Why playback stopped by itself, as the dock shows it to the user. */
const failureMessages = {
  noOutputDevice: "No audio output device is available.",
  outputDeviceUnavailable: "The audio output device is unavailable.",
  unsupportedOutput: "The output device configuration is unsupported.",
  outputFailed: "The audio output failed.",
  decodeFailed: "The audio file could not be decoded.",
} as const satisfies Record<PlaybackFailureCode, string>;

/** The offer shown after "Clear upcoming", for the Undo that puts the queue back. */
export const UNDO_CLEARED_MESSAGE = "Upcoming cleared";

/** The user-facing text for a playback failure code. */
export function playbackFailureMessage(code: PlaybackFailureCode): string {
  return failureMessages[code];
}
