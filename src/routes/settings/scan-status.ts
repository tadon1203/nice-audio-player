import { type ScanStatus as NativeScanStatus } from "#lib/native/bindings";

/** The words of a library scan that the settings screen shows. */
export class ScanStatus {
  public static label(state: NativeScanStatus | undefined): string {
    switch (state) {
      case "running":
        return "Scanning";
      case "completed":
        return "Scan complete";
      case "cancelled":
        return "Scan cancelled";
      case "failed":
        return "Scan failed";
      case "idle":
      case undefined:
        return "Ready to scan";
    }
  }
}
