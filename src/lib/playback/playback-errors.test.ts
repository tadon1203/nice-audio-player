import { describe, expect, it } from "vitest";
import { PlaybackError } from "#lib/native";
import { playbackErrorMessage } from "./playback-errors";

describe("playbackErrorMessage", () => {
  it("describes start-track failures instead of a generic message", () => {
    expect(
      playbackErrorMessage(
        new PlaybackError({ code: "common", error: { code: "trackUnavailable" } }),
      ),
    ).toBe("That track is unavailable on disk.");
    expect(playbackErrorMessage(new PlaybackError({ code: "queueBusy" }))).toBe(
      "The playback queue is busy. Try again.",
    );
  });

  it("describes a failed output by its failure code", () => {
    expect(
      playbackErrorMessage(new PlaybackError({ code: "output", failure: "decodeFailed" })),
    ).toBe("The audio file could not be decoded.");
  });

  it("describes a selection the library could not give", () => {
    expect(
      playbackErrorMessage(
        new PlaybackError({ code: "source", error: { code: "noPlayablePlaybackTracks" } }),
      ),
    ).toBe("There are no playable tracks here.");
  });
});
