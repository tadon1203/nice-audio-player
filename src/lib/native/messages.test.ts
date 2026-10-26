import { describe, expect, it } from "vitest";
import { CommandFailed } from "./errors";
import { errorMessage } from "./messages";

const general = "Something went wrong. Try again.";

describe("errorMessage", () => {
  it("returns the table text for a CommandFailed's code", () => {
    expect(errorMessage(new CommandFailed("duplicateDirectory"))).toBe(
      "That directory is already in the library.",
    );
    expect(errorMessage(new CommandFailed("notFound"))).toBe("That item could not be found.");
  });

  it("returns the general text for an internal failure", () => {
    expect(errorMessage(new CommandFailed("internal"))).toBe(general);
  });

  it("returns the general text for anything that is not a CommandFailed", () => {
    expect(errorMessage(new Error("boom"))).toBe(general);
    expect(errorMessage(null)).toBe(general);
  });
});
