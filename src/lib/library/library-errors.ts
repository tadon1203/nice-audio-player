import type {
  LibraryCommandError,
  LibraryStatus,
  LibraryUnavailableReason,
  ScanFailure,
} from "#lib/native";
import {
  albumNotFoundMessage,
  commonErrorMessage,
  commonErrorMessages,
  messageForCode,
  nativeErrorCode,
} from "#lib/native";

const commandMessages = {
  invalidDirectory: "That directory reference is invalid.",
  directoryNotDirectory: "The selected path is not a directory.",
  canonicalizationFailed: "The selected directory could not be resolved.",
  duplicateDirectory: "That directory is already in the library.",
  overlappingDirectory: "That directory overlaps an existing library directory.",
  directoryContainsDataDirectory:
    "That directory contains the app's own data, so it cannot be a library directory.",
  scanInProgress: "Library directories cannot be changed while a scan is running.",
  albumNotFound: albumNotFoundMessage,
  invalidCursor: "The list position is no longer valid. Retry to reload it.",
  albumArtistNotFound: "That artist could not be found.",
  directoryMissing: "A library directory is missing from disk.",
  scanAlreadyRunning: "A library scan is already running.",
  noEnabledDirectories: "Enable at least one library directory before scanning.",
  scanNotRunning: "No library scan is running.",
} as const satisfies Record<Exclude<LibraryCommandError["code"], "common">, string>;

const unavailableMessages = {
  databaseOpenFailed: "The library storage is unavailable.",
  migrationFailed: "The library database could not be upgraded.",
  schemaTooNew: "This library database was created by a newer version.",
  databaseCorrupt: "The library database is corrupt.",
} as const satisfies Record<LibraryUnavailableReason, string>;

const scanFailureMessages = {
  persistenceFailed: commonErrorMessages.persistenceFailed,
  directoryTraversalFailed: "A library directory could not be read.",
  panicked: "The scan stopped unexpectedly.",
} as const satisfies Record<ScanFailure, string>;

/** The user-facing messages for Library failures. */
export class LibraryErrors {
  public static statusMessage(status: LibraryStatus): string | null {
    return status.status === "ready"
      ? null
      : messageForCode(unavailableMessages, status.reason, commonErrorMessages.libraryUnavailable);
  }

  public static commandMessage(error: unknown): string {
    return (
      commonErrorMessage(error) ??
      messageForCode(commandMessages, nativeErrorCode(error), "The library operation failed.")
    );
  }

  /** Explains why a scan failed; the caller already shows that it failed. */
  public static scanFailureMessage(failureCode: string | null): string {
    return messageForCode(scanFailureMessages, failureCode, "The scan stopped unexpectedly.");
  }
}
