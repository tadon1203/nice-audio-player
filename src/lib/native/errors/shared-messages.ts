import type { CommandError } from "../bindings";
import { messageForCode, nativeErrorCode } from "./error-code";
import { NativeCommandError } from "./native-command-error";

/** The messages for the failures every command shares. Each one is written once, here. */
export const commonErrorMessages = {
  trackNotFound: "That track could not be found.",
  trackUnavailable: "That track is unavailable on disk.",
  libraryUnavailable: "The library is unavailable.",
  persistenceFailed: "The library database could not be updated.",
  taskFailed: "The request did not finish. Try again.",
} as const satisfies Record<
  Extract<
    CommandError["code"],
    "trackNotFound" | "trackUnavailable" | "libraryUnavailable" | "persistenceFailed" | "taskFailed"
  >,
  string
>;

/**
 * The message for an album the library does not hold. The library and playback tables both show
 * it, and neither can import the other, so it lives here.
 */
export const albumNotFoundMessage = "That album could not be found.";

/** The `code` a reply nests under its `error` field, or null when it has none. */
function nestedCode(reply: unknown): string | null {
  return typeof reply === "object" && reply !== null && "error" in reply
    ? nativeErrorCode(reply.error)
    : null;
}

/**
 * The message for a shared failure, when the reply nests one under `common`. Any other reply
 * gives null, so the caller can use its own table.
 */
export function commonErrorMessage(error: unknown): string | null {
  const reply = error instanceof NativeCommandError ? error.error : error;
  if (nativeErrorCode(reply) !== "common") return null;
  return messageForCode(commonErrorMessages, nestedCode(reply), "The request did not finish.");
}
