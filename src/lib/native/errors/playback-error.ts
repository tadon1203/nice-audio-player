import type { PlaybackServiceError } from "../bindings";
import { NativeCommandError } from "./native-command-error";

/** A playback command the Backend rejected. */
export class PlaybackError extends NativeCommandError<PlaybackServiceError> {
  public constructor(error: PlaybackServiceError) {
    super("playback", error);
  }
}
