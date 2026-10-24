import type { LibraryStatus, LibraryUnavailableReason, ScanFailure } from "#lib/native/bindings";

const unavailableMessages = {
  databaseOpenFailed: "The library storage is unavailable.",
  migrationFailed: "The library database could not be upgraded.",
  schemaTooNew: "This library database was created by a newer version.",
  databaseCorrupt: "The library database is corrupt.",
} as const satisfies Record<LibraryUnavailableReason, string>;

const scanFailureMessages = {
  persistenceFailed: "The library database could not be updated.",
  directoryTraversalFailed: "A library directory could not be read.",
  panicked: "The scan stopped unexpectedly.",
} as const satisfies Record<ScanFailure, string>;

/** The user-facing messages for Library states and scan failures. Command failures use errorMessage. */
export class LibraryErrors {
  public static statusMessage(status: LibraryStatus): string | null {
    if (status.status === "ready") return null;
    return unavailableMessages[status.reason] ?? "The library is unavailable.";
  }

  /** Explains why a scan failed; the caller already shows that it failed. */
  public static scanFailureMessage(failureCode: string | null): string {
    return failureCode !== null && Object.hasOwn(scanFailureMessages, failureCode)
      ? scanFailureMessages[failureCode as ScanFailure]
      : "The scan stopped unexpectedly.";
  }
}
