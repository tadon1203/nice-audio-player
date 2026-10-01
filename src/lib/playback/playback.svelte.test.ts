import { describe, expect, it, vi } from "vitest";
import type {
  PlaybackItem,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
  TNativeAPI,
} from "$lib/native";
import { createPlayback } from "./playback.svelte";

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
  trackNumber: null,
  discNumber: null,
  year: null,
  albumKey: null,
  albumTrackCount: null,
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
    seekRevision: 0,
    durationMs: 60_000,
    outputDevice: { id: "speakers", name: "Speakers" },
    channelConversion: "none",
    sourceFormat: "FLAC",
    sourceBitDepth: 24,
    sourceBitrateKbps: null,
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
  history: [],
  historyCount: 0,
  upcoming: [],
  upcomingCount: 0,
  repeatMode: "off",
  shuffleEnabled: false,
});

const baseApi = (overrides: Partial<TNativeAPI> = {}) =>
  ({
    onEvent: () => () => undefined,
    getPlaybackState: async () => stopped(1, null),
    getPlaybackQueue: async () => queue(1),
    ...overrides,
  }) as unknown as TNativeAPI;

describe("playback session ordering", () => {
  it("rejects stale playback revisions", async () => {
    const playback = createPlayback(baseApi({ getPlaybackState: async () => stopped(1, "a") }));
    await playback.initialize();

    playback.acceptPlayback(stopped(0, "stale"));
    playback.acceptPlayback(stopped(1, "a"));
    playback.acceptPlayback(stopped(2, "b"));

    expect(playback.snapshot?.base.revision).toBe(2);
    expect(playback.item?.trackId).toBe("b");
    expect(playback.playbackRevision).toBe(2);
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const playback = createPlayback(baseApi());
    playback.acceptPlayback(stopped(50, null));
    playback.acceptQueue({
      revision: 2,
      current: queueItem("track-1"),
      history: [],
      historyCount: 0,
      upcoming: [],
      upcomingCount: 0,
      repeatMode: "off",
      shuffleEnabled: false,
    });

    expect(playback.playbackRevision).toBe(50);
    expect(playback.queueRevision).toBe(2);
    expect(playback.queue?.current?.title).toBe("Current track");
  });

  it("moves initialization from loading to ready", async () => {
    const playback = createPlayback(baseApi());

    expect(playback.connection).toBe("loading");
    await playback.initialize();

    expect(playback.connection).toBe("ready");
  });

  it("moves initialization failures to failed instead of leaving loading", async () => {
    const playback = createPlayback(
      baseApi({
        getPlaybackState: async () => {
          throw { code: "noOutputDevice" };
        },
      }),
    );

    await playback.initialize();

    expect(playback.connection).toBe("failed");
    expect(playback.error).toBe("No audio output device is available.");
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
    const playback = createPlayback(api);
    await playback.initialize();

    playback.setVolume(0.2);
    playback.setVolume(0.8);
    expect(playback.volumePending).toBe(true);
    expect(playback.output.volume).toBe(0.8);
    expect(volumeCalls).toEqual([0.2]);

    await Promise.all([playback.pause(), playback.seek(1000)]);
    expect(api.pausePlayback).toHaveBeenCalledTimes(1);
    expect(api.seekPlayback).toHaveBeenCalledWith(1000);

    releaseFirstVolume?.();
    await vi.waitFor(() => expect(volumeCalls).toEqual([0.2, 0.8]));
    await vi.waitFor(() => expect(playback.volumePending).toBe(false));
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
    const playback = createPlayback(api);
    await playback.initialize();

    const first = playback.pause();
    const second = playback.resume();
    expect(playback.transportPending).toBe("pause");
    expect(playback.transport.pending).toBe("pause");
    await second;
    expect(api.resumePlayback).not.toHaveBeenCalled();

    releasePause?.();
    await first;
    expect(playback.transportPending).toBeNull();
  });
});

describe("playback session derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const playback = createPlayback(baseApi());

    playback.acceptPlayback(playing(1, "a", 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, "a", 250));
    playback.acceptPlayback(playing(3, "a", 500));

    expect(playback.item).toBe(first);
    expect(playback.positionMs).toBe(500);
    expect(playback.durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const playback = createPlayback(baseApi());

    playback.acceptPlayback(playing(1, "a", 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, "b", 0));

    expect(playback.item).not.toBe(first);
    expect(playback.item?.trackId).toBe("b");
  });

  it("keeps naming the last track while stopped and resets the position", () => {
    const playback = createPlayback(baseApi());

    playback.acceptPlayback(playing(1, "a", 4_000));
    playback.acceptPlayback(stopped(2, "a"));

    expect(playback.item?.trackId).toBe("a");
    expect(playback.positionMs).toBe(0);
    expect(playback.durationMs).toBeNull();
  });

  it("feeds every accepted snapshot to the clock and ignores stale ones", () => {
    const accept = vi.fn();
    const playback = createPlayback(baseApi(), { accept } as never);

    playback.acceptPlayback(playing(2, "a", 0));
    playback.acceptPlayback(playing(1, "a", 0));

    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("starting playback", () => {
  it("passes the context and the clicked track to the backend", async () => {
    const startPlayback = vi.fn(async () => playing(2, "c", 0));
    const playback = createPlayback(baseApi({ startPlayback }));
    await playback.initialize();
    const context = { kind: "album", key: { title: "Album", albumArtist: "Artist" } } as const;

    await playback.startPlayback(context, "c");

    expect(startPlayback).toHaveBeenCalledWith(context, "c");
    expect(playback.item?.trackId).toBe("c");
  });

  it("does not report a request that a newer one replaced", async () => {
    const playback = createPlayback(
      baseApi({
        startPlayback: async () => {
          throw { code: "superseded" };
        },
      }),
    );
    await playback.initialize();

    await playback.startPlayback({ kind: "album", key: { title: "A", albumArtist: "B" } }, null);

    expect(playback.error).toBeNull();
    expect(playback.transportPending).toBeNull();
  });

  it("reports a real failure", async () => {
    const playback = createPlayback(
      baseApi({
        startPlayback: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    await playback.initialize();

    await playback.startPlayback({ kind: "album", key: { title: "A", albumArtist: "B" } }, "1");

    expect(playback.error).toBe("That track is unavailable on disk.");
  });

  it("clears a reported failure on request", async () => {
    const playback = createPlayback(
      baseApi({
        startPlayback: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    await playback.initialize();
    await playback.startPlayback({ kind: "album", key: { title: "A", albumArtist: "B" } }, "1");
    expect(playback.error).not.toBeNull();

    playback.clearError();

    expect(playback.error).toBeNull();
    expect(playback.transport.commandError).toBeNull();
  });
});

describe("changing the volume", () => {
  const mutedSnapshot = (): PlaybackSnapshot => {
    const snapshot = stopped(1, null);
    return { ...snapshot, base: { ...snapshot.base, muted: true } };
  };

  it("unmutes when the volume changes while muted", async () => {
    const setPlaybackMuted = vi.fn(async () => stopped(3, null));
    const playback = createPlayback(
      baseApi({
        getPlaybackState: async () => mutedSnapshot(),
        setPlaybackVolume: vi.fn(async () => mutedSnapshot()),
        setPlaybackMuted,
      }),
    );
    await playback.initialize();

    playback.changeVolume(0.4);

    expect(playback.output.volume).toBe(0.4);
    expect(setPlaybackMuted).toHaveBeenCalledWith(false);
  });

  it("leaves mute alone when not muted", async () => {
    const setPlaybackMuted = vi.fn(async () => stopped(3, null));
    const playback = createPlayback(
      baseApi({ setPlaybackVolume: async () => stopped(2, null), setPlaybackMuted }),
    );
    await playback.initialize();

    playback.changeVolume(0.4);

    expect(setPlaybackMuted).not.toHaveBeenCalled();
  });
});

describe("last navigation", () => {
  it("records previous only for the item change it caused", async () => {
    const playback = createPlayback(
      baseApi({
        getPlaybackState: async () => playing(1, "b", 0),
        previousPlayback: async () => playing(2, "a", 0),
      }),
    );
    await playback.initialize();

    expect(playback.lastNavigation).toBe("next");
    await playback.previous();
    expect(playback.item?.trackId).toBe("a");
    expect(playback.lastNavigation).toBe("previous");

    // A change nobody asked for (auto-advance) goes forward again.
    playback.acceptPlayback(playing(3, "c", 0));
    expect(playback.lastNavigation).toBe("next");
  });

  it("does not let a refused Previous recolour the Next in flight", async () => {
    let finishNext: (() => void) | undefined;
    const playback = createPlayback(
      baseApi({
        getPlaybackState: async () => playing(1, "a", 0),
        nextPlayback: async () => {
          await new Promise<void>((resolve) => {
            finishNext = resolve;
          });
          return playing(2, "b", 0);
        },
      }),
    );
    await playback.initialize();

    const next = playback.next();
    await playback.previous();
    finishNext?.();
    await next;
    expect(playback.item?.trackId).toBe("b");
    expect(playback.lastNavigation).toBe("next");
  });

  it("does not let a failed Previous colour the next automatic change", async () => {
    const playback = createPlayback(
      baseApi({
        getPlaybackState: async () => playing(1, "b", 0),
        previousPlayback: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    await playback.initialize();

    await playback.previous();
    playback.acceptPlayback(playing(2, "c", 0));
    expect(playback.lastNavigation).toBe("next");
  });
});
