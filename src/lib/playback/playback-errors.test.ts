import { describe, expect, it } from "vitest";
import { PlaybackError } from "#lib/native";
import { playbackErrorMessage } from "./playback-errors";

describe("playbackErrorMessage", () => {
  it("describes start-track failures instead of a generic message", () => {
    expect(playbackErrorMessage(new PlaybackError({ code: "trackUnavailable" }))).toBe(
      "That track is unavailable on disk.",
    );
    expect(playbackErrorMessage(new PlaybackError({ code: "queueBusy" }))).toBe(
      "The playback queue is busy. Try again.",
    );
  });
});
