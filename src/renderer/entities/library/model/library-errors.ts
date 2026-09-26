import type { LibraryStatus } from "@/shared/ipc";

const messages: Record<string, string> = {
  duplicateRoot: "That folder is already in the library.",
  overlappingRoot: "That folder overlaps an existing library folder.",
  rootNotDirectory: "The selected path is not a folder.",
  canonicalizationFailed: "The selected folder could not be resolved.",
  scanInProgress: "Library folders cannot be changed while a scan is running.",
  scanAlreadyRunning: "A library scan is already running.",
  noEnabledRoots: "Enable at least one library folder before scanning.",
  scanNotRunning: "No library scan is running.",
  libraryUnavailable: "The library is unavailable.",
  persistenceFailed: "The library database could not be updated.",
  databaseCorrupt: "The library database is corrupt.",
  schemaTooNew: "This library database was created by a newer version.",
  migrationFailed: "The library database could not be upgraded.",
  databaseOpenFailed: "The library storage is unavailable.",
  storageUnavailable: "The library storage is unavailable.",
  albumNotFound: "That album could not be found.",
  invalidAlbumKey: "That album reference is invalid.",
};

export function libraryStatusMessage(status: LibraryStatus): string | null {
  return status.status === "ready"
    ? null
    : (messages[status.reason] ?? messages.libraryUnavailable);
}

export function libraryCommandErrorMessage(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  return messages[code] ?? "The library operation failed.";
}
