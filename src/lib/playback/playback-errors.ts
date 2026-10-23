import {
  albumNotFoundMessage,
  commonErrorMessages,
  messageForCode,
  type PlaybackError,
  type PlaybackServiceError,
  type PlaybackSourceError,
} from "#lib/native";
import { PlaybackFailure } from "./playback-failure";

const messages = {
  superseded: "That request was replaced by a newer one.",
  workerUnavailable: "The playback engine is unavailable.",
  queueItemNotFound: "That item is no longer in the queue.",
  queueBusy: "The playback queue is busy. Try again.",
  invalidVolume: "That volume level is invalid.",
  invalidDeviceId: "The selected output device is invalid.",
  invalidPlaybackState: "That action is not available in the current playback state.",
  durationUnavailable: "The track duration is unavailable.",
  seekFailed: "The track could not be repositioned.",
} as const satisfies Record<
  Exclude<PlaybackServiceError["code"], "common" | "output" | "source">,
  string
>;

const sourceMessages = {
  albumNotFound: albumNotFoundMessage,
  trackNotMember: "That track is not part of this album.",
  trackNotPlayable: "That track cannot be played.",
  noPlayablePlaybackTracks: "There are no playable tracks here.",
} as const satisfies Record<PlaybackSourceError["code"], string>;

/** The message for a playback command the Backend rejected. */
export function playbackErrorMessage(error: PlaybackError): string {
  const reply = error.error;
  switch (reply.code) {
    case "common":
      return messageForCode(commonErrorMessages, reply.error.code, "The request did not finish.");
    case "output":
      return PlaybackFailure.message(reply.failure);
    case "source":
      return sourceMessages[reply.error.code];
    default:
      return messages[reply.code];
  }
}
