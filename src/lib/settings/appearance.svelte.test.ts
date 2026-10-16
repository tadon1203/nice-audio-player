import { describe, expect, it, vi } from "vitest";
import type { Appearance as AppearanceState, TNativeAPI, Versioned } from "#lib/native";
import { Appearance } from "./appearance.svelte";

function stubApi(overrides: Partial<Pick<TNativeAPI, "updateAppearance">> = {}) {
  return {
    updateAppearance: vi.fn(async (): Promise<Versioned<AppearanceState>> => ({
      revision: 1,
      value: { artworkBackdrop: true, calmMotion: false },
    })),
    ...overrides,
  } as unknown as TNativeAPI & {
    updateAppearance: ReturnType<typeof vi.fn>;
  };
}

const appearance: Versioned<AppearanceState> = {
  revision: 0,
  value: { artworkBackdrop: true, calmMotion: false },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Appearance", () => {
  it("knows nothing until the backend's appearance is accepted, then holds it", () => {
    const store = new Appearance(stubApi());
    expect(store.artworkBackdrop).toBeNull();
    expect(store.calmMotion).toBeNull();
    store.accept(appearance);
    expect(store.artworkBackdrop).toBe(true);
    expect(store.calmMotion).toBe(false);
  });

  it("holds the values it accepts", () => {
    const store = new Appearance(stubApi());
    store.accept({ revision: 1, value: { artworkBackdrop: false, calmMotion: true } });
    expect(store.artworkBackdrop).toBe(false);
    expect(store.calmMotion).toBe(true);
  });

  it("keeps a value only if its revision is newer than the one it holds", () => {
    const store = new Appearance(stubApi());
    store.accept({ revision: 2, value: { artworkBackdrop: false, calmMotion: true } });
    store.accept({ revision: 1, value: { artworkBackdrop: true, calmMotion: false } });
    expect(store.artworkBackdrop).toBe(false);
    expect(store.calmMotion).toBe(true);
  });

  it("records a failed connect instead of throwing", () => {
    const store = new Appearance(stubApi());
    store.initializeFailed(new Error("boom"));
    expect(store.error).not.toBeNull();
  });

  it("applies an update before the backend answers, sending null for untouched fields", async () => {
    const pending = deferred<Versioned<AppearanceState>>();
    const api = stubApi({ updateAppearance: vi.fn(() => pending.promise) });
    const store = new Appearance(api);
    store.accept(appearance);

    const result = store.update({ calmMotion: true });
    expect(store.calmMotion).toBe(true);
    expect(api.updateAppearance).toHaveBeenCalledWith({
      artworkBackdrop: null,
      calmMotion: true,
    });

    pending.resolve({ revision: 1, value: { artworkBackdrop: true, calmMotion: true } });
    expect(await result).toEqual({ ok: true });
    expect(store.calmMotion).toBe(true);
  });

  it("rolls back and reports a failed update", async () => {
    const api = stubApi({
      updateAppearance: vi.fn().mockRejectedValue({ code: "persistenceFailed" }),
    });
    const store = new Appearance(api);
    store.accept(appearance);

    const result = await store.update({ artworkBackdrop: false });

    expect(store.artworkBackdrop).toBe(true);
    expect(result.ok).toBe(false);
    expect(store.error).toBe(result.ok ? null : result.error);
    expect(store.error).toContain("persistenceFailed");
  });
});
