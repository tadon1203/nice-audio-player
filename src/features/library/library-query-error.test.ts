import { describe, expect, it } from "vitest";
import { formatLibraryQueryError } from "./library-query-error";

describe("formatLibraryQueryError", () => {
  it("keeps safe backend, transport, and payload failure categories distinct", () => {
    expect(formatLibraryQueryError({ code: "libraryUnavailable" }, "albums")).toBe(
      "The library database is unavailable.",
    );
    expect(formatLibraryQueryError({ code: "persistenceFailed" }, "albums")).toBe(
      "The albums index could not be read.",
    );
    expect(formatLibraryQueryError({ code: "taskFailed" }, "albums")).toBe(
      "The albums query could not be completed.",
    );
    expect(formatLibraryQueryError(new Error("Invalid library albums payload."), "albums")).toBe(
      "The albums response was invalid.",
    );
    expect(formatLibraryQueryError(new Error("network"), "albums")).toBe(
      "Albums could not be loaded because the library service is unavailable.",
    );
  });
});
