import { describe, expect, it, vi } from "vitest";
import { command, player } from "./commands";

const mocks = vi.hoisted(() => ({ playerPause: vi.fn() }));
vi.mock("./bindings", () => ({ commands: { playerPause: mocks.playerPause } }));

describe("area objects", () => {
  it("runs the generated command behind a method and returns its value as a Result", async () => {
    mocks.playerPause.mockResolvedValue(null);
    await expect(player.pause()).resolves.toEqual({ ok: true, value: null });
    expect(mocks.playerPause).toHaveBeenCalledOnce();
  });
});

describe("command", () => {
  it("returns the value of a command that succeeds", async () => {
    await expect(command(() => Promise.resolve(3))).resolves.toEqual({ ok: true, value: 3 });
  });

  it("turns a coded rejection into an error Result with its code", async () => {
    await expect(command(() => Promise.reject({ code: "notFound" }))).resolves.toEqual({
      ok: false,
      error: { code: "notFound" },
    });
  });

  it("turns a rejection without a string code into an internal failure", async () => {
    await expect(command(() => Promise.reject(new Error("ipc down")))).resolves.toEqual({
      ok: false,
      error: { code: "internal" },
    });
    await expect(command(() => Promise.reject({ code: 7 }))).resolves.toEqual({
      ok: false,
      error: { code: "internal" },
    });
  });
});
