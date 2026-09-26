import { describe, expect, it, vi } from "vitest";
import type { PlaybackQueueSnapshot, PlaybackSnapshot, TNativeAPI } from "@/shared/ipc";
import { createPlaybackController, createPlaybackStore } from "./playback-session";

type PlaybackApi = TNativeAPI;

const stopped = (revision: number, path: string | null): PlaybackSnapshot => ({
  status: "stopped",
  revision,
  file: path ? { path, fileName: path, extension: "mp3" } : null,
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" },
  canGoPrevious: false,
  canGoNext: false,
});

const queue = (revision: number): PlaybackQueueSnapshot => ({
  revision,
  current: null,
  upcoming: [],
  repeatMode: "off",
  shuffleEnabled: false,
});

const baseApi = (overrides: Partial<PlaybackApi> = {}) =>
  ({
    onEvent: () => () => undefined,
    getPlaybackState: async () => stopped(1, null),
    getPlaybackQueue: async () => queue(1),
    ...overrides,
  }) as unknown as PlaybackApi;

describe("playback session ordering", () => {
  it("rejects stale playback revisions", async () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(baseApi({ getPlaybackState: async () => stopped(1, "a") }));

    controller.acceptPlayback(stopped(0, "stale"));
    controller.acceptPlayback(stopped(1, "a"));
    controller.acceptPlayback(stopped(2, "b"));

    expect(store.getState().snapshot?.revision).toBe(2);
    expect(store.getState().snapshot?.file?.path).toBe("b");
    expect(store.getState().playbackRevision).toBe(2);
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    controller.acceptPlayback(stopped(50, null));
    controller.acceptQueue({
      revision: 2,
      current: { id: "track-1", title: "Current track", artist: "Artist", durationMs: 120000 },
      upcoming: [],
      repeatMode: "off",
      shuffleEnabled: false,
    });

    expect(store.getState().playbackRevision).toBe(50);
    expect(store.getState().queueRevision).toBe(2);
    expect(store.getState().queue?.current?.title).toBe("Current track");
  });

  it("moves initialization from loading to ready", async () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);

    expect(store.getState().connection).toBe("loading");
    await controller.initialize(baseApi());

    expect(store.getState().connection).toBe("ready");
    expect(controller.select().connection).toBe("ready");
  });

  it("moves initialization failures to failed instead of leaving loading", async () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    const api = baseApi({
      getPlaybackState: async () => {
        throw { code: "noOutputDevice" };
      },
    });

    await controller.initialize(api);

    expect(store.getState().connection).toBe("failed");
    expect(controller.select().connection).toBe("failed");
    expect(store.getState().error).toBe("No audio output device is available.");
  });

  it("coalesces volume writes without blocking transport or seek", async () => {
    let releaseFirstVolume: (() => void) | undefined;
    const volumeCalls: number[] = [];
    let volumeRevision = 2;
    const api = baseApi({
      setPlaybackVolume: vi.fn(async (value: number) => {
        volumeCalls.push(value);
        if (volumeCalls.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstVolume = resolve;
          });
        }
        return stopped(volumeRevision++, null);
      }),
      pausePlayback: vi.fn(async () => stopped(10, null)),
      seekPlayback: vi.fn(async () => stopped(11, null)),
    });
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(api);

    controller.setVolume(0.2);
    controller.setVolume(0.8);
    expect(store.getState().volumePending).toBe(true);
    expect(volumeCalls).toEqual([0.2]);

    await Promise.all([controller.pause(), controller.seek(1000)]);
    expect(api.pausePlayback).toHaveBeenCalledTimes(1);
    expect(api.seekPlayback).toHaveBeenCalledWith(1000);

    releaseFirstVolume?.();
    await vi.waitFor(() => expect(volumeCalls).toEqual([0.2, 0.8]));
    await vi.waitFor(() => expect(store.getState().volumePending).toBe(false));
  });

  it("permits only one transport command at a time", async () => {
    let releasePause: (() => void) | undefined;
    const api = baseApi({
      pausePlayback: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releasePause = resolve;
        });
        return stopped(2, null);
      }),
      resumePlayback: vi.fn(async () => stopped(3, null)),
    });
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(api);

    const first = controller.pause();
    const second = controller.resume();
    expect(store.getState().transportPending).toBe("pause");
    await second;
    expect(api.resumePlayback).not.toHaveBeenCalled();

    releasePause?.();
    await first;
    expect(store.getState().transportPending).toBeNull();
  });
});
