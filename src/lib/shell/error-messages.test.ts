import { describe, expect, it } from "vitest";
import { AudioDevicesError, PlaybackError, SessionError } from "#lib/native";
import { ErrorMessages } from "./error-messages";

describe("ErrorMessages.of", () => {
  it("picks the playback table for a playback error", () => {
    expect(ErrorMessages.of(new PlaybackError({ code: "decodeFailed" }))).toBe(
      "The audio file could not be decoded.",
    );
  });

  it("picks the audio devices table for an audio devices error", () => {
    expect(ErrorMessages.of(new AudioDevicesError({ code: "enumerationFailed" }))).toBe(
      "The audio output devices could not be listed.",
    );
  });

  it("describes an output failure that the connect command reported", () => {
    expect(ErrorMessages.of(new SessionError({ code: "noOutputDevice" }))).toBe(
      "No audio output device is available.",
    );
    expect(ErrorMessages.of(new SessionError({ code: "somethingNew" }))).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("falls back to the general message for anything else", () => {
    expect(ErrorMessages.of(new Error("boom"))).toBe("Something went wrong. Try again.");
    expect(ErrorMessages.of(null)).toBe("Something went wrong. Try again.");
  });
});
