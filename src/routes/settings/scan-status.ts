import { type ScanStatus as NativeScanStatus } from "#lib/native/bindings";

/** The words and the share of a library scan that the settings screen shows. */
export class ScanStatus {
  /**
   * How far a scan is, 0-100, when it can be known: a rescan finds about as many files as the
   * last scan left. A first scan has nothing to compare with, so its bar just runs (`null`).
   */
  public static share(scan: {
    expectedCount: number;
    discoveredCount: number;
    inspectedCount: number;
  }): number | null {
    if (scan.expectedCount > 0) {
      return Math.min(99, Math.round((scan.discoveredCount / scan.expectedCount) * 100));
    }
    return scan.inspectedCount === 0 ? 0 : null;
  }

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
