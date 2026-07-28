import { describe, expect, it } from "vitest";

import {
  isPauseAudioPlaybackError,
  isPlaybackSnapshot,
  isResumeAudioPlaybackError,
} from "./audio-files";

describe("isPlaybackSnapshot", () => {
  it("accepts a playing payload with camel-case playbackId", () => {
    expect(isPlaybackSnapshot({ status: "playing", playbackId: "1" })).toBe(true);
  });

  it("rejects a playing payload with snake-case playback_id", () => {
    expect(isPlaybackSnapshot({ status: "playing", playback_id: "1" })).toBe(false);
  });

  it("accepts a paused payload with camel-case playbackId", () => {
    expect(isPlaybackSnapshot({ status: "paused", playbackId: "1" })).toBe(true);
  });

  it("rejects a paused payload without playbackId", () => {
    expect(isPlaybackSnapshot({ status: "paused" })).toBe(false);
  });

  it("rejects a paused payload with snake-case playback_id", () => {
    expect(isPlaybackSnapshot({ status: "paused", playback_id: "1" })).toBe(false);
  });
});

describe("playback control error validators", () => {
  it("accept pause and resume error codes", () => {
    for (const code of [
      "playbackWorkerUnavailable",
      "invalidPlaybackState",
      "outputFailed",
      "taskFailed",
    ]) {
      expect(isPauseAudioPlaybackError({ code })).toBe(true);
      expect(isResumeAudioPlaybackError({ code })).toBe(true);
    }
  });

  it("reject unknown pause and resume error codes", () => {
    expect(isPauseAudioPlaybackError({ code: "workerUnavailable" })).toBe(false);
    expect(isResumeAudioPlaybackError({ code: "outputStreamPauseFailed" })).toBe(false);
  });
});
