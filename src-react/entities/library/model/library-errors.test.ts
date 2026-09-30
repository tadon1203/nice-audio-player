import { describe, expect, it } from "vitest";
import {
  libraryCommandErrorMessage,
  libraryScanFailureMessage,
  libraryStatusMessage,
} from "./library-errors";

describe("libraryCommandErrorMessage", () => {
  it("describes codes that used to fall through to the generic message", () => {
    expect(libraryCommandErrorMessage({ code: "albumArtistNotFound" })).toBe(
      "That artist could not be found.",
    );
  });

  it("falls back for unknown codes and non-error values", () => {
    expect(libraryCommandErrorMessage({ code: "somethingNew" })).toBe(
      "The library operation failed.",
    );
    expect(libraryCommandErrorMessage(undefined)).toBe("The library operation failed.");
  });
});

describe("libraryStatusMessage", () => {
  it("has no message while the library is ready", () => {
    expect(libraryStatusMessage({ status: "ready" })).toBeNull();
  });

  it("maps unavailable reasons", () => {
    expect(libraryStatusMessage({ status: "unavailable", reason: "databaseCorrupt" })).toBe(
      "The library database is corrupt.",
    );
  });
});

describe("libraryScanFailureMessage", () => {
  it("never exposes a raw failure code", () => {
    expect(libraryScanFailureMessage("rootTraversalFailed")).toBe(
      "A library folder could not be read.",
    );
    expect(libraryScanFailureMessage("unknownInternalCode")).toBe("The scan stopped unexpectedly.");
    expect(libraryScanFailureMessage(null)).toBe("The scan stopped unexpectedly.");
  });
});
