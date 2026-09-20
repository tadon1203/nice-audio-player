import { describe, expect, it } from "vitest";
import { ipcRequestSchemas, ipcResponseSchemas } from "./schemas";

describe("IPC contract", () => {
  it("has a request and response schema for every allowed invoke channel", () => {
    const channels = Object.keys(ipcRequestSchemas);
    expect(channels.length).toBeGreaterThan(20);
    for (const channel of channels) {
      expect(ipcRequestSchemas[channel as keyof typeof ipcRequestSchemas]).toBeDefined();
      expect(ipcResponseSchemas[channel as keyof typeof ipcResponseSchemas]).toBeDefined();
    }
  });

  it("rejects malformed playback arguments", () => {
    expect(ipcRequestSchemas["playback:seek"].safeParse([Number.NaN]).success).toBe(false);
    expect(ipcRequestSchemas["playback:seek"].safeParse([42]).success).toBe(true);
  });
});
