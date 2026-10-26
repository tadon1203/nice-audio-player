import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Appearance as AppearanceState } from "#lib/native/bindings";
import { appearance as appearanceCommands } from "#lib/native/commands";
import { Appearance } from "./appearance.svelte";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ appearance: { update: mocks.update } }));

const saved: AppearanceState = { artworkBackdrop: true, calmMotion: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({ ok: true, value: undefined });
});

describe("Appearance", () => {
  it("knows nothing until the backend's appearance is accepted, then holds it", () => {
    const store = new Appearance(appearanceCommands);
    expect(store.artworkBackdrop).toBeNull();
    expect(store.calmMotion).toBeNull();
    store.accept(saved);
    expect(store.artworkBackdrop).toBe(true);
    expect(store.calmMotion).toBe(false);
  });

  it("holds each pushed appearance, so the newest push is the one it shows", () => {
    const store = new Appearance(appearanceCommands);
    store.accept({ artworkBackdrop: false, calmMotion: true });
    store.accept(saved);
    expect(store.artworkBackdrop).toBe(true);
    expect(store.calmMotion).toBe(false);
  });

  it("sends the update, with the untouched fields as null, and leaves the value to the push", async () => {
    const store = new Appearance(appearanceCommands);
    store.accept(saved);

    await store.update({ artworkBackdrop: null, calmMotion: true });

    expect(mocks.update).toHaveBeenCalledWith({ artworkBackdrop: null, calmMotion: true });
    expect(store.calmMotion).toBe(false);
    store.accept({ artworkBackdrop: true, calmMotion: true });
    expect(store.calmMotion).toBe(true);
  });

  it("returns the failure when the backend refuses the update, and keeps the held value", async () => {
    const error = { code: "internal" } as const;
    mocks.update.mockResolvedValue({ ok: false, error });
    const store = new Appearance(appearanceCommands);
    store.accept(saved);

    await expect(store.update({ artworkBackdrop: false, calmMotion: null })).resolves.toEqual({
      ok: false,
      error,
    });
    expect(store.artworkBackdrop).toBe(true);
  });
});
