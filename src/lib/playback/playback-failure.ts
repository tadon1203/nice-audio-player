import type { PlaybackFailureCode } from "$lib/native";

/** Why playback stopped by itself, as the dock tells the listener. */
export const playbackFailureMessages = {
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

export function playbackFailureMessage(code: PlaybackFailureCode): string {
  return playbackFailureMessages[code];
}
