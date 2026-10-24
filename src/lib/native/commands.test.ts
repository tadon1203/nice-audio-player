import { describe, expect, it } from "vitest";
import { command } from "./commands";
import { IpcError, NativeError } from "./errors";

describe("command", () => {
  it("returns the value of a command that succeeds", async () => {
    await expect(command("library", () => Promise.resolve(3))).resolves.toBe(3);
  });

  it("turns a coded rejection into a NativeError with its area and code", async () => {
    const failure = await command("player", () => Promise.reject({ code: "trackNotFound" })).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(NativeError);
    expect(failure).toMatchObject({ area: "player", code: "trackNotFound" });
  });

  it("turns a rejection without a string code into an IpcError", async () => {
    await expect(
      command("app", () => Promise.reject(new Error("ipc down"))),
    ).rejects.toBeInstanceOf(IpcError);
    await expect(command("app", () => Promise.reject({ code: 7 }))).rejects.toBeInstanceOf(
      IpcError,
    );
  });
});
