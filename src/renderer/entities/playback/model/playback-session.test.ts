import { describe, expect, it, vi } from "vitest";
import type {
  PlaybackItem,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
  TNativeAPI,
} from "@/shared/ipc";
import { createPlaybackController, createPlaybackStore } from "./playback-session";

type PlaybackApi = TNativeAPI;

const base = (revision: number) => ({
  revision,
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
});

const item = (id: string): PlaybackItem => ({
  queueItemId: `queue-${id}`,
  trackId: id,
  file: { path: `C:/Music/${id}.mp3`, fileName: `${id}.mp3`, extension: "mp3" },
  title: id,
  artist: null,
  album: null,
  albumArtist: null,
  artwork: null,
  durationMs: 60_000,
});

const stopped = (revision: number, id: string | null): PlaybackSnapshot => ({
  status: "stopped",
  base: base(revision),
  item: id ? item(id) : null,
});

const playing = (revision: number, id: string, positionMs: number): PlaybackSnapshot => ({
  status: "playing",
  base: base(revision),
  session: {
    item: item(id),
    playbackId: "1",
    positionMs,
    durationMs: 60_000,
    outputDevice: { id: "speakers", name: "Speakers" },
    channelConversion: "none",
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  },
});

const queueItem = (id: string): PlaybackQueueItem => ({
  id,
  trackId: id,
  title: "Current track",
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 120_000,
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

    expect(store.getState().snapshot?.base.revision).toBe(2);
    expect(store.getState().item?.trackId).toBe("b");
    expect(store.getState().playbackRevision).toBe(2);
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    controller.acceptPlayback(stopped(50, null));
    controller.acceptQueue({
      revision: 2,
      current: queueItem("track-1"),
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

describe("playback session derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);

    controller.acceptPlayback(playing(1, "a", 0));
    const first = store.getState().item;
    controller.acceptPlayback(playing(2, "a", 250));
    controller.acceptPlayback(playing(3, "a", 500));

    expect(store.getState().item).toBe(first);
    expect(store.getState().positionMs).toBe(500);
    expect(store.getState().durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);

    controller.acceptPlayback(playing(1, "a", 0));
    const first = store.getState().item;
    controller.acceptPlayback(playing(2, "b", 0));

    expect(store.getState().item).not.toBe(first);
    expect(store.getState().item?.trackId).toBe("b");
  });

  it("keeps naming the last track while stopped and resets the position", () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);

    controller.acceptPlayback(playing(1, "a", 4_000));
    controller.acceptPlayback(stopped(2, "a"));

    expect(store.getState().item?.trackId).toBe("a");
    expect(store.getState().positionMs).toBe(0);
    expect(store.getState().durationMs).toBeNull();
  });
});

describe("starting playback", () => {
  it("passes the context and the clicked track to the backend", async () => {
    const startPlayback = vi.fn(async () => playing(2, "c", 0));
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(baseApi({ startPlayback }));
    const context = { kind: "album", key: { title: "Album", albumArtist: "Artist" } } as const;

    await controller.startPlayback(context, "c");

    expect(startPlayback).toHaveBeenCalledWith(context, "c");
    expect(store.getState().item?.trackId).toBe("c");
  });

  it("does not report a request that a newer one replaced", async () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(
      baseApi({
        startPlayback: async () => {
          throw { code: "superseded" };
        },
      }),
    );

    await controller.startPlayback({ kind: "album", key: { title: "A", albumArtist: "B" } }, null);

    expect(store.getState().error).toBeNull();
    expect(store.getState().transportPending).toBeNull();
  });

  it("reports a real failure", async () => {
    const store = createPlaybackStore();
    const controller = createPlaybackController(store);
    await controller.initialize(
      baseApi({
        startPlayback: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );

    await controller.startPlayback({ kind: "album", key: { title: "A", albumArtist: "B" } }, "1");

    expect(store.getState().error).toBe("That track is unavailable on disk.");
  });
});
