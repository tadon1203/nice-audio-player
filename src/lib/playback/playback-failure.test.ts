import { describe, expect, it } from "vitest";
import { playbackFailureMessage, playbackFailureMessages } from "./playback-failure";

describe("playback failure messages", () => {
  it("say something for every failure code", () => {
    for (const [code, message] of Object.entries(playbackFailureMessages)) {
      expect(message.length, code).toBeGreaterThan(0);
    }
    expect(playbackFailureMessage("decodeFailed")).toBe("The audio file could not be decoded.");
  });
});
