import { describe, expect, it, vi } from "vitest";
import type { AppearanceSettings, TNativeAPI } from "$lib/native";
import { createSettings } from "./settings.svelte";

function stubApi(overrides: Partial<Pick<TNativeAPI, "getSettings" | "updateSettings">> = {}) {
  return {
    getSettings: vi.fn(
      async (): Promise<AppearanceSettings> => ({
        artworkBackdrop: true,
        calmMotion: false,
      }),
    ),
    updateSettings: vi.fn(
      async (): Promise<AppearanceSettings> => ({
        artworkBackdrop: true,
        calmMotion: false,
      }),
    ),
    ...overrides,
  } as unknown as TNativeAPI & {
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Settings", () => {
  it("knows nothing until loaded, then holds the backend values", async () => {
    const settings = createSettings(stubApi());
    expect(settings.artworkBackdrop).toBeNull();
    expect(settings.calmMotion).toBeNull();
    await settings.load();
    expect(settings.artworkBackdrop).toBe(true);
    expect(settings.calmMotion).toBe(false);
  });

  it("loads the backend values", async () => {
    const api = stubApi({
      getSettings: vi.fn(async () => ({
        artworkBackdrop: false,
        calmMotion: true,
      })),
    });
    const settings = createSettings(api);
    await settings.load();
    expect(settings.artworkBackdrop).toBe(false);
    expect(settings.calmMotion).toBe(true);
  });

  it("records a failed load instead of throwing", async () => {
    const settings = createSettings(
      stubApi({ getSettings: vi.fn().mockRejectedValue(new Error("boom")) }),
    );
    await settings.load();
    expect(settings.error).not.toBeNull();
  });

  it("applies an update before the backend answers, sending null for untouched fields", async () => {
    const pending = deferred<AppearanceSettings>();
    const api = stubApi({ updateSettings: vi.fn(() => pending.promise) });
    const settings = createSettings(api);
    await settings.load();

    const result = settings.update({ calmMotion: true });
    expect(settings.calmMotion).toBe(true);
    expect(api.updateSettings).toHaveBeenCalledWith({
      appearance: { artworkBackdrop: null, calmMotion: true },
    });

    pending.resolve({ artworkBackdrop: true, calmMotion: true });
    expect(await result).toEqual({ ok: true });
    expect(settings.calmMotion).toBe(true);
  });

  it("rolls back and reports a failed update", async () => {
    const api = stubApi({
      updateSettings: vi.fn().mockRejectedValue({ code: "persistenceFailed" }),
    });
    const settings = createSettings(api);
    await settings.load();

    const result = await settings.update({ artworkBackdrop: false });

    expect(settings.artworkBackdrop).toBe(true);
    expect(result.ok).toBe(false);
    expect(settings.error).toBe(result.ok ? null : result.error);
    expect(settings.error).toContain("persistenceFailed");
  });

  it("mirrors settingsChanged events only", async () => {
    const settings = createSettings(stubApi());
    settings.mirrorEvent({
      event: "settingsChanged",
      payload: { artworkBackdrop: false, calmMotion: true },
    });
    expect(settings.artworkBackdrop).toBe(false);
    expect(settings.calmMotion).toBe(true);

    settings.mirrorEvent({ event: "waveformReady", payload: { playbackId: "a" } });
    expect(settings.calmMotion).toBe(true);
  });
});
