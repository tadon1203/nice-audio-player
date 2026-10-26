import { describe, expect, it } from "vitest";
import { errorMessage } from "./messages";

const general = "Something went wrong. Try again.";

describe("errorMessage", () => {
  it("returns the table text for an error's code", () => {
    expect(errorMessage({ code: "duplicateDirectory" })).toBe(
      "That directory is already in the library.",
    );
    expect(errorMessage({ code: "notFound" })).toBe("That item could not be found.");
  });

  it("returns the general text for an internal failure", () => {
    expect(errorMessage({ code: "internal" })).toBe(general);
  });
});
