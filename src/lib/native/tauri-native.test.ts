import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { commands } from "./bindings";
import { AppearanceError } from "./errors/appearance-error";
import { IpcError } from "./errors/ipc-error";
import { PlaybackError } from "./errors/playback-error";
import { SessionError } from "./errors/session-error";
import { SupersededError } from "./errors/superseded-error";
import { TauriNative } from "./tauri-native";

/** Only the commands a test calls; each one rejects with the reply the test gives it. */
function fakeCommands(reply: unknown) {
  const reject = () => Promise.reject(reply);
  return {
    connect: vi.fn(reject),
    pausePlayback: vi.fn(reject),
    setPlaybackMuted: vi.fn(reject),
    updateAppearance: vi.fn(reject),
  } as unknown as typeof commands;
}

describe("TauriNative", () => {
  // A Channel registers its callback with the desktop runtime; the test only needs the registration.
  beforeEach(() => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { transformCallback: () => 1 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a playback error for a playback command's coded reply", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "queueBusy" }));
    const failure = await clients.playback.pause().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PlaybackError);
    expect(failure).toMatchObject({ domain: "playback", code: "queueBusy" });
  });

  it("throws SupersededError for the superseded code, which is a playback error", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "superseded" }));
    const failure = await clients.playback.pause().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SupersededError);
    expect(failure).toBeInstanceOf(PlaybackError);
  });

  it("throws a session error for the connect command's coded reply", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "unavailable" }));
    const failure = await clients.session.connect(() => {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SessionError);
    expect(failure).toMatchObject({ domain: "session", code: "unavailable" });
  });

  it("throws an appearance error for the update command's coded reply", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "persistenceFailed" }));
    const failure = await clients.appearance
      .update({ artworkBackdrop: null, calmMotion: true })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppearanceError);
    expect(failure).toMatchObject({ domain: "appearance", code: "persistenceFailed" });
  });

  it("throws IpcError when the reply has no string code", async () => {
    const clients = TauriNative.clients(fakeCommands(new Error("ipc down")));
    const failure = await clients.playback.pause().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IpcError);
    expect(failure).toMatchObject({ code: "ipcError" });
  });

  it("throws IpcError when the coded reply's code is not a string", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: 7 }));
    const failure = await clients.playback.setMuted(true).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IpcError);
  });
});
