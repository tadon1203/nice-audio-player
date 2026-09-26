import type {
  PlaybackCommandError,
  StartLibraryAlbumTrackError,
  StartLibraryTrackError,
} from "@/shared/ipc";
import { messageForCode, nativeErrorCode } from "@/renderer/shared/lib/native-error";

type PlaybackErrorCode = (
  | PlaybackCommandError
  | StartLibraryTrackError
  | StartLibraryAlbumTrackError
)["code"];

const messages = {
  invalidArgument: "The playback request was invalid.",
  playbackWorkerUnavailable: "The playback engine is unavailable.",
  queueItemNotFound: "That item is no longer in the queue.",
  queueBusy: "The playback queue is busy. Try again.",
  invalidVolume: "That volume level is invalid.",
  invalidDeviceId: "The selected output device is invalid.",
  invalidPlaybackState: "That action is not available in the current playback state.",
  durationUnavailable: "The track duration is unavailable.",
  seekFailed: "The track could not be repositioned.",
  decodeFailed: "The audio file could not be decoded.",
  noOutputDevice: "No audio output device is available.",
  outputDeviceUnavailable: "The selected output device is unavailable.",
  unsupportedOutputConfiguration: "The output device configuration is unsupported.",
  outputStreamBuildFailed: "The audio output could not be prepared.",
  outputStreamStartFailed: "The audio output could not be started.",
  outputStreamPauseFailed: "The audio output could not be paused.",
  outputStreamResumeFailed: "The audio output could not be resumed.",
  outputStreamRuntimeFailed: "The audio output stopped unexpectedly.",
  completionTimingFailed: "Playback completion could not be determined.",
  sampleRateConversionFailed: "The audio could not be converted.",
  outputFailed: "The audio output failed.",
  invalidId: "That track reference is invalid.",
  invalidAlbumKey: "That album reference is invalid.",
  invalidTrackId: "That track reference is invalid.",
  trackNotFound: "That track could not be found.",
  trackNotMember: "That track is not part of this album.",
  albumNotFound: "That album could not be found.",
  trackUnavailable: "That track is unavailable on disk.",
  trackNotPlayable: "That track cannot be played.",
  noPlayableTracks: "This album has no playable tracks.",
  sourceUnavailable: "The audio source is unavailable.",
  libraryUnavailable: "The library is unavailable.",
  persistenceFailed: "The library database could not be read.",
  taskFailed: "The playback request did not finish.",
} as const satisfies Record<PlaybackErrorCode, string>;

export function playbackCommandErrorMessage(error: unknown): string {
  return messageForCode(messages, nativeErrorCode(error), "Playback could not be started.");
}
