import { beforeEach, describe, expect, it, vi } from "vitest";

const { sink } = vi.hoisted(() => ({
  sink: {
    debug: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    warn: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@tauri-apps/plugin-log", () => sink);

import { __diagnostics, diagnostics } from "./diagnostics";

describe("diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes levels and normalizes scalar context", () => {
    diagnostics.debug("library.scan.started", { context: { count: 3, enabled: true } });
    diagnostics.info("library.scan.completed");
    diagnostics.warn("library.scan.failed");
    diagnostics.error("frontend.react.uncaught_error");
    expect(sink.debug).toHaveBeenCalledWith("library.scan.started", {
      keyValues: { count: "3", enabled: "true" },
    });
    expect(sink.info).toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalled();
    expect(sink.error).toHaveBeenCalled();
  });

  it("sanitizes causes and sensitive context without serializing arbitrary objects", () => {
    const options = __diagnostics.normalizeOptions({
      cause: { code: "bad", detail: "private" },
      context: { path: "C:\\Music\\track.flac", url: "https://example.com/a?q=secret", count: 4 },
    });
    expect(options.keyValues).toEqual({
      path: "[redacted]",
      url: "[redacted]",
      count: "4",
      error_code: "bad",
    });
  });

  it.each([
    ["C:\\Users\\Alice\\Music\\track.flac", "[redacted]"],
    ["\\\\server\\share\\Music\\track.flac", "[redacted]"],
    ["/Users/alice/Music/track.flac", "[redacted]"],
    ["file:///Users/alice/Music/track.flac", "[redacted]"],
    ["https://example.com/a?q=secret#fragment", "https://example.com/a"],
    ["http://example.com/a?token=secret", "http://example.com/a"],
  ])("redacts complete location tokens in causes: %s", (value, expected) => {
    expect(__diagnostics.classifyCause(new Error(value)).error_message).toBe(expected);
    expect(__diagnostics.classifyCause(value).error_message).toBe(expected);
  });

  it("caps strings and swallows sink failures", async () => {
    expect(__diagnostics.sanitizeString("x".repeat(2_000))).toHaveLength(1_024);
    sink.error.mockRejectedValueOnce(new Error("sink unavailable"));
    expect(() => diagnostics.error("frontend.failure")).not.toThrow();
    await Promise.resolve();
  });
});
