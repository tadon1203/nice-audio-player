import { describe, expect, it } from "vitest";
import { ScanStatus } from "./scan-status";

describe("ScanStatus.share", () => {
  it("is the share of the expected files found so far", () => {
    expect(ScanStatus.share({ expectedCount: 200, discoveredCount: 50, inspectedCount: 10 })).toBe(
      25,
    );
  });

  it("stops at 99 until the scan is done", () => {
    expect(
      ScanStatus.share({ expectedCount: 100, discoveredCount: 100, inspectedCount: 100 }),
    ).toBe(99);
    expect(ScanStatus.share({ expectedCount: 10, discoveredCount: 500, inspectedCount: 1 })).toBe(
      99,
    );
  });

  it("is unknown for a first scan that has started inspecting", () => {
    expect(
      ScanStatus.share({ expectedCount: 0, discoveredCount: 30, inspectedCount: 5 }),
    ).toBeNull();
  });

  it("is zero while nothing has been inspected", () => {
    expect(ScanStatus.share({ expectedCount: 0, discoveredCount: 30, inspectedCount: 0 })).toBe(0);
  });
});

describe("ScanStatus.label", () => {
  it("names every state", () => {
    expect(ScanStatus.label("running")).toBe("Scanning");
    expect(ScanStatus.label("completed")).toBe("Scan complete");
    expect(ScanStatus.label("cancelled")).toBe("Scan cancelled");
    expect(ScanStatus.label("failed")).toBe("Scan failed");
    expect(ScanStatus.label("idle")).toBe("Ready to scan");
    expect(ScanStatus.label(undefined)).toBe("Ready to scan");
  });
});
