import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Appearance as AppearanceState, type Revisioned } from "#lib/native/bindings";
import { appearance as appearanceCommands } from "#lib/native/commands";
import { Appearance } from "./appearance.svelte";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ appearance: { update: mocks.update } }));

const saved: Revisioned<AppearanceState> = {
  revision: 0,
  value: { artworkBackdrop: true, calmMotion: false },
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(saved);
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

  it("keeps a value only if its revision is newer than the one it holds", () => {
    const store = new Appearance(appearanceCommands);
    store.accept({ revision: 2, value: { artworkBackdrop: false, calmMotion: true } });
    store.accept({ revision: 1, value: { artworkBackdrop: true, calmMotion: false } });
    expect(store.artworkBackdrop).toBe(false);
    expect(store.calmMotion).toBe(true);
  });

  it("shows an update before the backend answers, sending the untouched fields as null", async () => {
    const pending = deferred<Revisioned<AppearanceState>>();
    mocks.update.mockReturnValue(pending.promise);
    const store = new Appearance(appearanceCommands);
    store.accept(saved);

    const result = store.update({ artworkBackdrop: null, calmMotion: true });
    expect(store.calmMotion).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ artworkBackdrop: null, calmMotion: true });

    pending.resolve({ revision: 1, value: { artworkBackdrop: true, calmMotion: true } });
    await result;
    expect(store.calmMotion).toBe(true);
    expect(store.artworkBackdrop).toBe(true);
  });

  it("rolls back its own change and throws when the save fails", async () => {
    const failure = { code: "persistenceFailed" };
    mocks.update.mockRejectedValue(failure);
    const store = new Appearance(appearanceCommands);
    store.accept(saved);

    await expect(store.update({ artworkBackdrop: false, calmMotion: null })).rejects.toBe(failure);
    expect(store.artworkBackdrop).toBe(true);
  });

  it("shows nothing optimistic before the first value, and throws on a failed save", async () => {
    const failure = { code: "persistenceFailed" };
    mocks.update.mockRejectedValue(failure);
    const store = new Appearance(appearanceCommands);

    await expect(store.update({ artworkBackdrop: null, calmMotion: true })).rejects.toBe(failure);
    expect(store.calmMotion).toBeNull();
  });
});
