import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { commands } from "./bindings";
import { IpcError, NativeError } from "./errors";
import { TauriNative } from "./tauri-native";

/** Only the commands a test calls; each one rejects with the reply the test gives it. */
function fakeCommands(reply: unknown): typeof commands {
  const reject = (): Promise<never> => Promise.reject(reply);
  return {
    appConnect: vi.fn(reject),
    playerPause: vi.fn(reject),
    playerSetMuted: vi.fn(reject),
    appearanceUpdate: vi.fn(reject),
    playerListOutputDevices: vi.fn(reject),
    libraryStatus: vi.fn(reject),
    lyricsTrack: vi.fn(reject),
    meterStart: vi.fn(reject),
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

  it("names the playback area for a playback command's coded rejection", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "queueBusy" }));
    const failure = await clients?.playback.pause().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NativeError);
    expect(failure).toMatchObject({ area: "player", code: "queueBusy" });
  });

  it("names the app area for the connect command", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "taskFailed" }));
    const failure = await clients?.session.connect(() => {}).catch((error: unknown) => error);
    expect(failure).toMatchObject({ area: "app", code: "taskFailed" });
  });

  it("names the appearance area for the update command", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "persistenceFailed" }));
    const failure = await clients?.appearance
      .update({ artworkBackdrop: null, calmMotion: true })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ area: "appearance", code: "persistenceFailed" });
  });

  it("names the player area for the device list, which shares the playback commands", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "deviceEnumerationFailed" }));
    const failure = await clients?.playback.listOutputDevices().catch((error: unknown) => error);
    expect(failure).toMatchObject({ area: "player", code: "deviceEnumerationFailed" });
  });

  it("names the library area for a library command", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "libraryUnavailable" }));
    const failure = await clients?.library.status().catch((error: unknown) => error);
    expect(failure).toMatchObject({ area: "library", code: "libraryUnavailable" });
  });

  it("names the lyrics area for the lyrics command", async () => {
    const clients = TauriNative.clients(fakeCommands({ code: "trackNotFound" }));
    const failure = await clients?.lyrics.trackLyrics(1).catch((error: unknown) => error);
    expect(failure).toMatchObject({ area: "lyrics", code: "trackNotFound" });
  });

  it("throws IpcError when the meter subscription is refused without a code", async () => {
    const clients = TauriNative.clients(fakeCommands(new Error("ipc down")));
    const failure = await clients?.meter.subscribe(() => {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IpcError);
  });

  it("returns null outside the desktop app", () => {
    vi.stubGlobal("window", undefined);
    expect(TauriNative.clients()).toBeNull();
  });
});
