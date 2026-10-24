import { describe, expect, it, vi } from "vitest";
import { command, player } from "./commands";
import { IpcError, NativeError } from "./errors";

const mocks = vi.hoisted(() => ({ playerPause: vi.fn() }));
vi.mock("./bindings", () => ({ commands: { playerPause: mocks.playerPause } }));

describe("area objects", () => {
  it("runs the generated command behind a method and returns its result", async () => {
    const reply = { revision: 2, value: { status: "paused" } };
    mocks.playerPause.mockResolvedValue(reply);
    await expect(player.pause()).resolves.toBe(reply);
    expect(mocks.playerPause).toHaveBeenCalledOnce();
  });
});

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
