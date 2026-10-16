import {
  AppearanceError,
  AudioDevicesError,
  LibraryError,
  PlaybackError,
  SessionError,
} from "#lib/native";
import { messageForCode, nativeErrorCode } from "#lib/native";
import { LibraryErrors } from "#lib/library/library-errors";
import { playbackErrorMessage } from "#lib/playback/playback-errors";
import { PlaybackFailure } from "#lib/playback/playback-failure";

const audioDevicesMessages = {
  enumerationFailed: "The audio output devices could not be listed.",
} as const satisfies Record<AudioDevicesError["code"], string>;

const generalMessage = "Something went wrong. Try again.";

/** The message for a failure, picked by its error class. Unknown failures get the general message. */
export class ErrorMessages {
  public static of(error: unknown): string {
    if (error instanceof PlaybackError) return playbackErrorMessage(error);
    if (error instanceof AudioDevicesError) return audioDevicesMessages[error.code];
    if (error instanceof AppearanceError) return "The setting could not be saved.";
    if (error instanceof LibraryError) return LibraryErrors.commandMessage(error);
    // The connect command reports an output failure with its playback failure code.
    if (error instanceof SessionError) {
      return messageForCode(PlaybackFailure.messages, nativeErrorCode(error), generalMessage);
    }
    return generalMessage;
  }
}
