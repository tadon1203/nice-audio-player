import { describe, expect, it } from "vitest";
import { NativeError } from "./errors";
import { errorMessage } from "./messages";

const general = "Something went wrong. Try again.";

describe("errorMessage", () => {
  it("returns the table text for a NativeError's code", () => {
    expect(errorMessage(new NativeError("library", { code: "duplicateDirectory" }))).toBe(
      "That directory is already in the library.",
    );
    expect(errorMessage(new NativeError("player", { code: "queueBusy" }))).toBe(
      "The playback queue is busy. Try again.",
    );
  });

  it("shows the playback failure text for an output failure", () => {
    expect(
      errorMessage(new NativeError("player", { code: "output", failure: "decodeFailed" })),
    ).toBe("The audio file could not be decoded.");
  });

  it("returns the general text for anything that is not a NativeError", () => {
    expect(errorMessage(new Error("boom"))).toBe(general);
    expect(errorMessage(null)).toBe(general);
  });
});
