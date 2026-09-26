import { describe, expect, it } from "vitest";
import { playbackCommandErrorMessage } from "./playback-errors";

describe("playbackCommandErrorMessage", () => {
  it("describes start-track failures instead of a generic message", () => {
    expect(playbackCommandErrorMessage({ code: "trackUnavailable" })).toBe(
      "That track is unavailable on disk.",
    );
    expect(playbackCommandErrorMessage({ code: "queueBusy" })).toBe(
      "The playback queue is busy. Try again.",
    );
  });

  it("falls back for unknown codes", () => {
    expect(playbackCommandErrorMessage({ code: "somethingNew" })).toBe(
      "Playback could not be started.",
    );
    expect(playbackCommandErrorMessage(null)).toBe("Playback could not be started.");
  });
});
