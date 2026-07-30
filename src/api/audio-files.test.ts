import { describe, expect, it } from "vitest";

import {
  isPauseAudioPlaybackError,
  isPlaybackMuteError,
  isPlaybackSnapshot,
  isResumeAudioPlaybackError,
  isSetPlaybackVolumeError,
  isSeekAudioPlaybackError,
} from "./audio-files";
import { formatPlaybackTime } from "@/lib/playback-time";

describe("isPlaybackSnapshot", () => {
  it("accepts playing and paused payloads with timing fields", () => {
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        positionMs: 1_000,
        durationMs: 2_000,
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
    expect(
      isPlaybackSnapshot({
        status: "paused",
        playbackId: "1",
        positionMs: 1_000,
        durationMs: 2_000,
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
  });

  it("rejects each missing required field for both timed states", () => {
    for (const status of ["playing", "paused"] as const) {
      expect(isPlaybackSnapshot({ status, positionMs: 1_000, durationMs: 2_000 })).toBe(false);
      expect(isPlaybackSnapshot({ status, playbackId: "1", durationMs: 2_000 })).toBe(false);
      expect(isPlaybackSnapshot({ status, playbackId: "1", positionMs: 1_000 })).toBe(false);
    }
  });

  it("rejects a playing payload with snake-case playback_id", () => {
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        position_ms: 1_000,
        duration_ms: 2_000,
      }),
    ).toBe(false);
  });

  it("accepts a paused payload with camel-case playbackId", () => {
    expect(isPlaybackSnapshot({ status: "paused", playbackId: "1" })).toBe(false);
  });

  it("rejects a paused payload without playbackId", () => {
    expect(isPlaybackSnapshot({ status: "paused" })).toBe(false);
  });

  it("rejects a paused payload with snake-case playback_id", () => {
    expect(
      isPlaybackSnapshot({
        status: "paused",
        playback_id: "1",
        position_ms: 1_000,
        duration_ms: 2_000,
      }),
    ).toBe(false);
  });

  it("rejects invalid timing values and positions beyond duration", () => {
    const invalidValues = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "1,000",
      null,
    ];
    for (const field of ["positionMs", "durationMs"] as const) {
      for (const value of invalidValues.filter(
        (value) => !(field === "durationMs" && value === null),
      )) {
        const payload = {
          status: "playing" as const,
          playbackId: "1",
          positionMs: 1_000,
          durationMs: 2_000,
          [field]: value,
        };
        expect(isPlaybackSnapshot(payload)).toBe(false);
      }
    }
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        positionMs: 1_000,
        durationMs: null,
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        positionMs: 2_001,
        durationMs: 2_000,
        volume: 1,
        muted: false,
      }),
    ).toBe(false);
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        positionMs: 2_000,
        durationMs: 2_000,
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
    expect(
      isPlaybackSnapshot({
        status: "playing",
        playbackId: "1",
        positionMs: 0,
        durationMs: 2_000,
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
  });

  it("preserves stopped and failed snapshot validation", () => {
    expect(isPlaybackSnapshot({ status: "stopped", volume: 1, muted: false })).toBe(true);
    expect(
      isPlaybackSnapshot({
        status: "failed",
        playbackId: "1",
        error: "outputStreamRuntimeFailed",
        volume: 1,
        muted: false,
      }),
    ).toBe(true);
    expect(isPlaybackSnapshot({ status: "failed", error: "unknownFailure" })).toBe(false);
  });

  it("rejects missing or invalid volume state", () => {
    expect(isPlaybackSnapshot({ status: "stopped" })).toBe(false);
    expect(isPlaybackSnapshot({ status: "stopped", volume: 1 })).toBe(false);
    for (const volume of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
      expect(isPlaybackSnapshot({ status: "stopped", volume, muted: false })).toBe(false);
    }
    expect(isPlaybackSnapshot({ status: "stopped", volume: 1, muted: "false" })).toBe(false);
  });
});

describe("formatPlaybackTime", () => {
  it("formats floored minutes and padded seconds", () => {
    for (const [milliseconds, expected] of [
      [0, "0:00"],
      [999, "0:00"],
      [1_000, "0:01"],
      [59_999, "0:59"],
      [60_000, "1:00"],
      [61_999, "1:01"],
      [3_661_000, "61:01"],
      [-1, "0:00"],
    ] as const) {
      expect(formatPlaybackTime(milliseconds)).toBe(expected);
    }
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

describe("seek API error validation", () => {
  it("accepts every generated seek error code", () => {
    for (const code of [
      "invalidPlaybackState",
      "durationUnavailable",
      "seekFailed",
      "decodeFailed",
      "outputFailed",
      "playbackWorkerUnavailable",
      "taskFailed",
    ]) {
      expect(isSeekAudioPlaybackError({ code })).toBe(true);
    }
  });

  it("rejects malformed seek errors", () => {
    expect(isSeekAudioPlaybackError({ code: "unknown" })).toBe(false);
    expect(isSeekAudioPlaybackError(null)).toBe(false);
    expect(isSeekAudioPlaybackError({})).toBe(false);
  });
});

describe("volume and mute API validation", () => {
  it("accepts only generated volume and mute errors", () => {
    expect(isSetPlaybackVolumeError({ code: "invalidVolume" })).toBe(true);
    expect(isSetPlaybackVolumeError({ code: "taskFailed" })).toBe(true);
    expect(isSetPlaybackVolumeError({ code: "outputFailed" })).toBe(false);
    expect(isPlaybackMuteError({ code: "playbackWorkerUnavailable" })).toBe(true);
    expect(isPlaybackMuteError({ code: "invalidVolume" })).toBe(false);
  });
});
