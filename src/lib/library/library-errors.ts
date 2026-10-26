import type { LibraryStatus, ScanFailure } from "#lib/native/bindings";

const scanFailureMessages = {
  directoryUnreadable: "A library directory could not be read.",
  failed: "The scan stopped unexpectedly.",
} as const satisfies Record<ScanFailure, string>;

/** The user-facing messages for Library states and scan failures. Command failures use errorMessage. */
export class LibraryErrors {
  public static statusMessage(status: LibraryStatus): string | null {
    if (status.status === "ready") return null;
    return "The library storage is unavailable.";
  }

  /** Explains why a scan failed; the caller already shows that it failed. */
  public static scanFailureMessage(failureCode: string | null): string {
    return failureCode !== null && Object.hasOwn(scanFailureMessages, failureCode)
      ? scanFailureMessages[failureCode as ScanFailure]
      : "The scan stopped unexpectedly.";
  }
}
