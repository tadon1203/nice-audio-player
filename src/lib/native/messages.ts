import type { CommandError } from "./bindings";

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
