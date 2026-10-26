import { describe, expect, it } from "vitest";
import { LibraryErrors } from "./library-errors";

describe("LibraryErrors.statusMessage", () => {
  it("has no message while the library is ready", () => {
    expect(LibraryErrors.statusMessage({ status: "ready" })).toBeNull();
  });

  it("says the library storage is unavailable", () => {
    expect(LibraryErrors.statusMessage({ status: "unavailable" })).toBe(
      "The library storage is unavailable.",
    );
  });
});

describe("LibraryErrors.scanFailureMessage", () => {
  it("never exposes a raw failure code", () => {
    expect(LibraryErrors.scanFailureMessage("directoryUnreadable")).toBe(
      "A library directory could not be read.",
    );
    expect(LibraryErrors.scanFailureMessage("failed")).toBe("The scan stopped unexpectedly.");
    expect(LibraryErrors.scanFailureMessage("unknownInternalCode")).toBe(
      "The scan stopped unexpectedly.",
    );
    expect(LibraryErrors.scanFailureMessage(null)).toBe("The scan stopped unexpectedly.");
  });
});
