import type { LibraryCommandError, LibraryStatus, LibraryUnavailableReason } from "@/shared/ipc";
import { messageForCode, nativeErrorCode } from "@/renderer/shared/lib/native-error";

const commandMessages = {
  invalidRoot: "That folder reference is invalid.",
  rootNotFound: "That library folder could not be found.",
  rootNotDirectory: "The selected path is not a folder.",
  canonicalizationFailed: "The selected folder could not be resolved.",
  duplicateRoot: "That folder is already in the library.",
  overlappingRoot: "That folder overlaps an existing library folder.",
  scanInProgress: "Library folders cannot be changed while a scan is running.",
  invalidId: "That item reference is invalid.",
  albumNotFound: "That album could not be found.",
  invalidCursor: "The list position is no longer valid. Retry to reload it.",
  invalidAlbumKey: "That album reference is invalid.",
  invalidAlbumArtistKey: "That artist reference is invalid.",
  albumArtistNotFound: "That artist could not be found.",
  rootMissing: "A library folder is missing from disk.",
  scanAlreadyRunning: "A library scan is already running.",
  noEnabledRoots: "Enable at least one library folder before scanning.",
  scanNotRunning: "No library scan is running.",
  libraryUnavailable: "The library is unavailable.",
  persistenceFailed: "The library database could not be updated.",
  taskFailed: "The library operation did not finish.",
} as const satisfies Record<LibraryCommandError["code"], string>;

const unavailableMessages = {
  storageUnavailable: "The library storage is unavailable.",
  databaseOpenFailed: "The library storage is unavailable.",
  migrationFailed: "The library database could not be upgraded.",
  schemaTooNew: "This library database was created by a newer version.",
  databaseCorrupt: "The library database is corrupt.",
} as const satisfies Record<LibraryUnavailableReason, string>;

/** The backend reports scan failures as an untyped string; these are the known values. */
const scanFailureMessages: Readonly<Record<string, string>> = {
  persistenceFailed: "The library database could not be updated.",
  rootTraversalFailed: "A library folder could not be read.",
};

export function libraryStatusMessage(status: LibraryStatus): string | null {
  return status.status === "ready"
    ? null
    : messageForCode(unavailableMessages, status.reason, commandMessages.libraryUnavailable);
}

export function libraryCommandErrorMessage(error: unknown): string {
  return messageForCode(commandMessages, nativeErrorCode(error), "The library operation failed.");
}

/** Explains why a scan failed; the caller already shows that it failed. */
export function libraryScanFailureMessage(failureCode: string | null): string {
  return messageForCode(scanFailureMessages, failureCode, "The scan stopped unexpectedly.");
}
