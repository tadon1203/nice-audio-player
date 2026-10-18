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
  invalidRoot: "That folder reference is invalid.",
  rootNotDirectory: "The selected path is not a folder.",
  canonicalizationFailed: "The selected folder could not be resolved.",
  duplicateRoot: "That folder is already in the library.",
  overlappingRoot: "That folder overlaps an existing library folder.",
  rootContainsDataDirectory:
    "That folder contains the app's own data, so it cannot be a library folder.",
  scanInProgress: "Library folders cannot be changed while a scan is running.",
  albumNotFound: albumNotFoundMessage,
  invalidCursor: "The list position is no longer valid. Retry to reload it.",
  albumArtistNotFound: "That artist could not be found.",
  rootMissing: "A library folder is missing from disk.",
  scanAlreadyRunning: "A library scan is already running.",
  noEnabledRoots: "Enable at least one library folder before scanning.",
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
  rootTraversalFailed: "A library folder could not be read.",
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
