import { Check } from "lucide-react";
import {
  libraryScanFailureMessage,
  type LibraryScanSnapshot,
  type LibraryScanState,
} from "@/entities/library";
import { formatNumber } from "@/shared/lib/format";
import { Progress } from "@/shared/ui/shadcn/progress";
import { RollingNumber } from "@/shared/ui/rolling-number";

/**
 * How far a scan is, 0-100, when it can be known: a rescan finds about as many files as the
 * last scan left. A first scan has nothing to compare with, so its bar just runs (`null`).
 */
function scanShare(scan: {
  expectedCount: number;
  discoveredCount: number;
  inspectedCount: number;
}): number | null {
  if (scan.expectedCount > 0) {
    return Math.min(99, Math.round((scan.discoveredCount / scan.expectedCount) * 100));
  }
  return scan.inspectedCount === 0 ? 0 : null;
}

function formatProgress(value: number | null, label: string): string {
  return `${formatNumber(value)} ${label}`;
}

/** A running scan's counter: the number rolls as files are found, inspected and indexed. */
function ScanCount({ value, label }: { value: number; label: string }) {
  return (
    <span className="tabular-nums">
      <RollingNumber value={formatNumber(value)} /> {label}
    </span>
  );
}

export function scanLabel(state: LibraryScanState | undefined): string {
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

/** The running scan's counters, progress bar and current folder. */
export function ScanRunning({ scan }: { scan: LibraryScanSnapshot }) {
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <ScanCount value={scan.discoveredCount} label="discovered" />
        <ScanCount value={scan.inspectedCount} label="inspected" />
        <ScanCount value={scan.indexedCount} label="indexed" />
        <ScanCount value={scan.failedCount} label="failed" />
      </div>
      <Progress className="mt-3" value={scanShare(scan)} aria-label="Scan progress" />
      {scan.currentRoot ? (
        <p className="mt-2 truncate text-sm">Current folder: {scan.currentRoot.path}</p>
      ) : null}
    </div>
  );
}

/** What the last scan ended with: why it failed, or what it found. */
export function ScanResult({ scan }: { scan: LibraryScanSnapshot }) {
  if (scan.state === "failed") {
    return (
      <p className="mt-4 text-sm text-destructive" role="alert">
        {libraryScanFailureMessage(scan.failureCode)}
      </p>
    );
  }
  if (scan.state !== "completed") return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
      <Check className="size-4" aria-hidden="true" />
      {formatProgress(scan.discoveredCount, "discovered")},{" "}
      {formatProgress(scan.inspectedCount, "inspected")},{" "}
      {formatProgress(scan.indexedCount, "indexed")}, {formatProgress(scan.failedCount, "failed")}.
    </p>
  );
}
