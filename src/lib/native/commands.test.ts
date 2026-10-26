import { describe, expect, it, vi } from "vitest";
import { command, player } from "./commands";
import { CommandFailed } from "./errors";

const mocks = vi.hoisted(() => ({ playerPause: vi.fn() }));
vi.mock("./bindings", () => ({ commands: { playerPause: mocks.playerPause } }));

describe("area objects", () => {
  it("runs the generated command behind a method and returns its result", async () => {
    mocks.playerPause.mockResolvedValue(null);
    await expect(player.pause()).resolves.toBeNull();
    expect(mocks.playerPause).toHaveBeenCalledOnce();
  });
});

describe("command", () => {
  it("returns the value of a command that succeeds", async () => {
    await expect(command(() => Promise.resolve(3))).resolves.toBe(3);
  });

  it("turns a coded rejection into a CommandFailed with its code", async () => {
    const failure = await command(() => Promise.reject({ code: "notFound" })).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CommandFailed);
    expect(failure).toMatchObject({ code: "notFound" });
  });

  it("turns a rejection without a string code into an internal failure", async () => {
    await expect(command(() => Promise.reject(new Error("ipc down")))).rejects.toMatchObject({
      code: "internal",
    });
    await expect(command(() => Promise.reject({ code: 7 }))).rejects.toMatchObject({
      code: "internal",
    });
  });
});
