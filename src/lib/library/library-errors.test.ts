import { describe, expect, it } from "vitest";
import { LibraryErrors } from "./library-errors";

describe("LibraryErrors.commandMessage", () => {
  it("describes codes that used to fall through to the generic message", () => {
    expect(LibraryErrors.commandMessage({ code: "albumArtistNotFound" })).toBe(
      "That artist could not be found.",
    );
  });

  it("describes a shared failure nested under common", () => {
    expect(LibraryErrors.commandMessage({ code: "common", error: { code: "trackNotFound" } })).toBe(
      "That track could not be found.",
    );
  });

  it("falls back for unknown codes and non-error values", () => {
    expect(LibraryErrors.commandMessage({ code: "somethingNew" })).toBe(
      "The library operation failed.",
    );
    expect(LibraryErrors.commandMessage(undefined)).toBe("The library operation failed.");
  });
});

describe("LibraryErrors.statusMessage", () => {
  it("has no message while the library is ready", () => {
    expect(LibraryErrors.statusMessage({ status: "ready" })).toBeNull();
  });

  it("maps unavailable reasons", () => {
    expect(LibraryErrors.statusMessage({ status: "unavailable", reason: "databaseCorrupt" })).toBe(
      "The library database is corrupt.",
    );
  });
});

describe("LibraryErrors.scanFailureMessage", () => {
  it("never exposes a raw failure code", () => {
    expect(LibraryErrors.scanFailureMessage("rootTraversalFailed")).toBe(
      "A library folder could not be read.",
    );
    expect(LibraryErrors.scanFailureMessage("unknownInternalCode")).toBe(
      "The scan stopped unexpectedly.",
    );
    expect(LibraryErrors.scanFailureMessage(null)).toBe("The scan stopped unexpectedly.");
  });
});
