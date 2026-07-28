import { describe, expect, it } from "vitest";

import { isPlaybackSnapshot } from "./audio-files";

describe("isPlaybackSnapshot", () => {
  it("accepts a playing payload with camel-case playbackId", () => {
    expect(isPlaybackSnapshot({ status: "playing", playbackId: "1" })).toBe(true);
  });

  it("rejects a playing payload with snake-case playback_id", () => {
    expect(isPlaybackSnapshot({ status: "playing", playback_id: "1" })).toBe(false);
  });
});
