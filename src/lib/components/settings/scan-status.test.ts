import { describe, expect, it } from "vitest";
import { scanLabel, scanShare } from "./scan-status";

describe("scanShare", () => {
  it("is the share of the expected files found so far", () => {
    expect(scanShare({ expectedCount: 200, discoveredCount: 50, inspectedCount: 10 })).toBe(25);
  });

  it("stops at 99 until the scan is done", () => {
    expect(scanShare({ expectedCount: 100, discoveredCount: 100, inspectedCount: 100 })).toBe(99);
    expect(scanShare({ expectedCount: 10, discoveredCount: 500, inspectedCount: 1 })).toBe(99);
  });

  it("is unknown for a first scan that has started inspecting", () => {
    expect(scanShare({ expectedCount: 0, discoveredCount: 30, inspectedCount: 5 })).toBeNull();
  });

  it("is zero while nothing has been inspected", () => {
    expect(scanShare({ expectedCount: 0, discoveredCount: 30, inspectedCount: 0 })).toBe(0);
  });
});

describe("scanLabel", () => {
  it("names every state", () => {
    expect(scanLabel("running")).toBe("Scanning");
    expect(scanLabel("completed")).toBe("Scan complete");
    expect(scanLabel("cancelled")).toBe("Scan cancelled");
    expect(scanLabel("failed")).toBe("Scan failed");
    expect(scanLabel("idle")).toBe("Ready to scan");
    expect(scanLabel(undefined)).toBe("Ready to scan");
  });
});
