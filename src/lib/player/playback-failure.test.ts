import { describe, expect, it } from "vitest";
import { PlaybackFailure } from "./playback-failure";

describe("playback failure messages", () => {
  it("say something for every failure code", () => {
    for (const [code, message] of Object.entries(PlaybackFailure.messages)) {
      expect(message.length, code).toBeGreaterThan(0);
    }
    expect(PlaybackFailure.message("decodeFailed")).toBe("The audio file could not be decoded.");
  });
});
