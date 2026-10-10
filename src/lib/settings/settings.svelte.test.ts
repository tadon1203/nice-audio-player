import { describe, expect, it, vi } from "vitest";
import type { Appearance, TNativeAPI } from "$lib/native";
import { createSettings } from "./settings.svelte";

function stubApi(overrides: Partial<Pick<TNativeAPI, "updateSettings">> = {}) {
  return {
    updateSettings: vi.fn(
      async (): Promise<Appearance> => ({
        artworkBackdrop: true,
        calmMotion: false,
      }),
    ),
    ...overrides,
  } as unknown as TNativeAPI & {
    updateSettings: ReturnType<typeof vi.fn>;
  };
}

const appearance: Appearance = { artworkBackdrop: true, calmMotion: false };

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
  it("knows nothing until the backend's appearance is accepted, then holds it", () => {
    const settings = createSettings(stubApi());
    expect(settings.artworkBackdrop).toBeNull();
    expect(settings.calmMotion).toBeNull();
    settings.accept(appearance);
    expect(settings.artworkBackdrop).toBe(true);
    expect(settings.calmMotion).toBe(false);
  });

  it("holds the values it accepts", () => {
    const settings = createSettings(stubApi());
    settings.accept({ artworkBackdrop: false, calmMotion: true });
    expect(settings.artworkBackdrop).toBe(false);
    expect(settings.calmMotion).toBe(true);
  });

  it("records a failed connect instead of throwing", () => {
    const settings = createSettings(stubApi());
    settings.initializeFailed(new Error("boom"));
    expect(settings.error).not.toBeNull();
  });

  it("applies an update before the backend answers, sending null for untouched fields", async () => {
    const pending = deferred<Appearance>();
    const api = stubApi({ updateSettings: vi.fn(() => pending.promise) });
    const settings = createSettings(api);
    settings.accept(appearance);

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
    settings.accept(appearance);

    const result = await settings.update({ artworkBackdrop: false });

    expect(settings.artworkBackdrop).toBe(true);
    expect(result.ok).toBe(false);
    expect(settings.error).toBe(result.ok ? null : result.error);
    expect(settings.error).toContain("persistenceFailed");
  });
});
