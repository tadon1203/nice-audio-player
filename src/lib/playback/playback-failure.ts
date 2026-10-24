import type { PlaybackFailureCode } from "#lib/native/bindings";
import { outputFailureMessages } from "#lib/native/messages";

/** Why playback stopped by itself, as the dock tells the listener. The texts live in native/messages. */
export class PlaybackFailure {
  public static readonly messages = outputFailureMessages;

  public static message(code: PlaybackFailureCode): string {
    return PlaybackFailure.messages[code];
  }
}
