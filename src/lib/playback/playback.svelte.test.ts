import type { QueueItemId, TrackId } from "#lib/native";
import { describe, expect, it, vi } from "vitest";
import {
  PlaybackError,
  SupersededError,
  type PlaybackClient,
  type PlaybackItem,
  type PlaybackQueueItem,
  type PlaybackQueueSnapshot,
  type PlaybackSnapshot,
  type Versioned,
} from "#lib/native";
import { PlaybackClock } from "./playback-clock.svelte";
import { Playback } from "./playback.svelte";

vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));

const base = () => ({
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
});

const item = (id: TrackId): PlaybackItem => ({
  queueItemId: id,
  trackId: id,
  title: String(id),
  artist: null,
  album: null,
  albumArtist: null,
  artwork: null,
  durationMs: 60_000,
  trackNumber: null,
  discNumber: null,
  year: null,
  albumKey: null,
  albumId: null,
  albumArtistId: null,
  albumTrackCount: null,
});

const stopped = (revision: number, id: TrackId | null): Versioned<PlaybackSnapshot> => ({
  revision,
  value: { status: "stopped", base: base(), item: id ? item(id) : null },
});

const playing = (
  revision: number,
  id: TrackId,
  positionMs: number,
  seekRevision = 0,
  startedBy: "next" | "previous" | "auto" | "jump" = "jump",
): Versioned<PlaybackSnapshot> => ({
  revision,
  value: {
    status: "playing",
    base: base(),
    session: {
      item: item(id),
      startedBy,
      playbackId: 1,
      positionMs,
      seekRevision,
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
  },
});

const queueItem = (id: QueueItemId): PlaybackQueueItem => ({
  id,
  trackId: id,
  title: "Current track",
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 120_000,
});

const queueOf = (
  revision: number,
  patch: Partial<PlaybackQueueSnapshot> = {},
): Versioned<PlaybackQueueSnapshot> => ({
  revision,
  value: {
    current: null,
    history: [],
    historyCount: 0,
    upcoming: [],
    upcomingCount: 0,
    repeatMode: "off",
    shuffleEnabled: false,
    canRestorePrevious: false,
    ...patch,
  },
});

const queue = (revision: number) => queueOf(revision);

/** A client whose methods are only the ones a test gives; the others are never called. */
const fakeClient = (overrides: Partial<PlaybackClient> = {}) => overrides as PlaybackClient;

/** A clock that is never asked about time; the tests that need one pass their own. */
const quietClock = () => new PlaybackClock({ now: () => 0 });

/** What `connect` gives the Renderer: the first snapshot and queue, as the session routes them. */
function load(
  playback: Playback,
  snapshot: Versioned<PlaybackSnapshot>,
  queueSnapshot: Versioned<PlaybackQueueSnapshot>,
) {
  playback.acceptPlayback(snapshot);
  playback.acceptQueue(queueSnapshot);
}

describe("playback session ordering", () => {
  it("rejects stale playback revisions", () => {
    const playback = new Playback(fakeClient(), quietClock());
    load(playback, stopped(1, 1), queue(1));

    playback.acceptPlayback(stopped(0, 9));
    playback.acceptPlayback(stopped(1, 1));
    playback.acceptPlayback(stopped(2, 2));

    expect(playback.item?.trackId).toBe(2);
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const playback = new Playback(fakeClient(), quietClock());
    playback.acceptPlayback(stopped(50, null));
    playback.acceptQueue(queueOf(2, { current: queueItem(1) }));

    expect(playback.queueRevision).toBe(2);
    expect(playback.queue?.current?.title).toBe("Current track");
  });

  it("drops a command response older than the state it follows", async () => {
    const playback = new Playback(
      fakeClient({ pause: vi.fn(async () => stopped(2, 1)) }),
      quietClock(),
    );
    load(playback, stopped(1, 1), queue(1));
    playback.acceptPlayback(stopped(3, 2));

    await playback.pause();

    expect(playback.item?.trackId).toBe(2);
  });

  it("drops a queue command response older than the queue it follows", async () => {
    const playback = new Playback(
      fakeClient({
        setShuffle: vi.fn(async () => queueOf(2, { shuffleEnabled: false })),
      }),
      quietClock(),
    );
    load(playback, stopped(1, null), queueOf(3, { shuffleEnabled: true }));

    await playback.setShuffle(false);

    expect(playback.shuffleEnabled).toBe(true);
    expect(playback.queueRevision).toBe(3);
  });

  it("coalesces volume writes without blocking transport or seek", async () => {
    let releaseFirstVolume: (() => void) | undefined;
    const volumeCalls: number[] = [];
    let volumeRevision = 2;
    const client = fakeClient({
      setVolume: vi.fn(async (value: number) => {
        volumeCalls.push(value);
        if (volumeCalls.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstVolume = resolve;
          });
        }
        return stopped(volumeRevision++, null);
      }),
      pause: vi.fn(async () => stopped(10, null)),
      seek: vi.fn(async () => stopped(11, null)),
    });
    const playback = new Playback(client, quietClock());
    load(playback, stopped(1, null), queue(1));

    const first = playback.setVolume(0.2);
    const second = playback.setVolume(0.8);
    expect(playback.volumePending).toBe(true);
    expect(playback.volume).toBe(0.8);
    expect(volumeCalls).toEqual([0.2]);

    await Promise.all([playback.pause(), playback.seek(1000)]);
    expect(client.pause).toHaveBeenCalledTimes(1);
    expect(client.seek).toHaveBeenCalledWith(1000);

    releaseFirstVolume?.();
    await Promise.all([first, second]);
    expect(volumeCalls).toEqual([0.2, 0.8]);
    expect(playback.volumePending).toBe(false);
  });

  it("replaces the transport command waiting behind one in flight with SupersededError", async () => {
    let releasePause: (() => void) | undefined;
    const client = fakeClient({
      pause: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releasePause = resolve;
        });
        return stopped(2, null);
      }),
      resume: vi.fn(async () => stopped(3, null)),
      next: vi.fn(async () => stopped(4, null)),
    });
    const playback = new Playback(client, quietClock());
    load(playback, stopped(1, null), queue(1));

    const first = playback.pause();
    const replaced = playback.resume();
    const latest = playback.next();
    expect(playback.transportPending).toBe("pause");
    await expect(replaced).rejects.toBeInstanceOf(SupersededError);
    expect(client.resume).not.toHaveBeenCalled();
    expect(client.next).not.toHaveBeenCalled();

    releasePause?.();
    await first;
    await expect(latest).resolves.toBeUndefined();
    expect(client.next).toHaveBeenCalledTimes(1);
    expect(client.resume).not.toHaveBeenCalled();
    expect(playback.transportPending).toBeNull();
  });

  it("does not delay a seek or a volume change behind a transport command", async () => {
    let releaseStart: (() => void) | undefined;
    const client = fakeClient({
      start: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releaseStart = resolve;
        });
        return playing(2, 1, 0);
      }),
      seek: vi.fn(async () => playing(3, 1, 1_000)),
      setVolume: vi.fn(async () => playing(4, 1, 0)),
    });
    const playback = new Playback(client, quietClock());
    load(playback, stopped(1, null), queue(1));
    playback.acceptPlayback(playing(1, 1, 0));

    const start = playback.start({ kind: "tracks" } as never, 1);
    void playback.seek(1_000);
    void playback.setVolume(0.2);

    await vi.waitFor(() => expect(client.seek).toHaveBeenCalledWith(1_000));
    await vi.waitFor(() => expect(client.setVolume).toHaveBeenCalledWith(0.2));
    releaseStart?.();
    await start;
  });
});

describe("clearing the queue", () => {
  const withUpcoming = (revision: number) =>
    queueOf(revision, {
      current: queueItem(1),
      upcoming: [queueItem(2)],
      upcomingCount: 1,
    });

  it("resolves true when upcoming items were removed, so the caller can offer an undo", async () => {
    const playback = new Playback(
      fakeClient({
        clearQueue: vi.fn(async () => queue(2)),
      }),
      quietClock(),
    );
    load(playback, stopped(1, null), withUpcoming(1));

    await expect(playback.clearQueue()).resolves.toBe(true);
  });

  it("resolves false when nothing was upcoming", async () => {
    const playback = new Playback(
      fakeClient({ clearQueue: vi.fn(async () => queue(2)) }),
      quietClock(),
    );
    load(playback, stopped(1, null), queue(1));

    await expect(playback.clearQueue()).resolves.toBe(false);
  });
});

describe("seeking", () => {
  it("rounds to whole milliseconds", async () => {
    const seek = vi.fn(async () => playing(2, 1, 1_000));
    const playback = new Playback(fakeClient({ seek }), quietClock());
    playback.acceptPlayback(playing(1, 1, 0));

    await playback.seek(1_234.56);

    expect(seek).toHaveBeenCalledWith(1_235);
  });
});

describe("failures", () => {
  const failed = (revision: number, skipping: boolean, id = 1): Versioned<PlaybackSnapshot> => ({
    revision,
    value: {
      status: "failed",
      base: base(),
      item: item(id),
      playbackId: null,
      error: "outputDeviceUnavailable",
      skipping,
    },
  });

  it("exposes why playback stopped, and retries through resume", async () => {
    const resume = vi.fn(async () => playing(3, 1, 0));
    const playback = new Playback(fakeClient({ resume }), quietClock());
    playback.acceptPlayback(failed(2, false));

    expect(playback.status).toBe("failed");
    expect(playback.failure).toBe("outputDeviceUnavailable");

    await playback.resume();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(playback.failure).toBeNull();
  });

  it("is not a stop while the player moves on by itself", () => {
    const playback = new Playback(fakeClient(), quietClock());

    playback.acceptPlayback(failed(2, true));

    expect(playback.failure).toBeNull();
  });
});

describe("album shuffle", () => {
  const context = {
    kind: "album",
    albumId: "0f0e0d0c0b0a09080706050403020100",
  } as const;

  it("turns the shuffle on, then starts", async () => {
    const order: string[] = [];
    const playback = new Playback(
      fakeClient({
        setShuffle: vi.fn(async () => {
          order.push("shuffle");
          return queueOf(2, { shuffleEnabled: true });
        }),
        start: vi.fn(async () => {
          order.push("start");
          return playing(2, 1, 0);
        }),
      }),
      quietClock(),
    );

    await playback.shuffleAndStart(context);

    expect(order).toEqual(["shuffle", "start"]);
    expect(playback.shuffleEnabled).toBe(true);
  });

  it("does not start when the shuffle cannot be turned on, and throws why", async () => {
    const start = vi.fn(async () => playing(2, 1, 0));
    const playback = new Playback(
      fakeClient({
        setShuffle: async () => {
          throw { code: "workerUnavailable" };
        },
        start,
      }),
      quietClock(),
    );

    await expect(playback.shuffleAndStart(context)).rejects.toEqual({ code: "workerUnavailable" });
    expect(start).not.toHaveBeenCalled();
  });
});

describe("playback session derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const playback = new Playback(fakeClient(), quietClock());

    playback.acceptPlayback(playing(1, 1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, 1, 250));
    playback.acceptPlayback(playing(3, 1, 500));

    expect(playback.item).toBe(first);
    expect(playback.durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const playback = new Playback(fakeClient(), quietClock());

    playback.acceptPlayback(playing(1, 1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, 2, 0));

    expect(playback.item).not.toBe(first);
    expect(playback.item?.trackId).toBe(2);
  });

  it("keeps naming the last track while stopped and drops the session", () => {
    const playback = new Playback(fakeClient(), quietClock());

    playback.acceptPlayback(playing(1, 1, 4_000));
    playback.acceptPlayback(stopped(2, 1));

    expect(playback.item?.trackId).toBe(1);
    expect(playback.isActive).toBe(false);
    expect(playback.playbackId).toBeNull();
    expect(playback.durationMs).toBeNull();
  });

  it("tells isActive and isPlaying apart: a paused track is active but not playing", () => {
    const playback = new Playback(fakeClient(), quietClock());
    const paused = playing(1, 1, 0);
    playback.acceptPlayback({ ...paused, value: { ...paused.value, status: "paused" } } as never);

    expect(playback.isActive).toBe(true);
    expect(playback.isPlaying).toBe(false);
  });

  it("knows whether the album's track is loaded, by its ID", () => {
    const playback = new Playback(fakeClient(), quietClock());
    const albumId = "0f0e0d0c0b0a09080706050403020100";
    const loaded = playing(1, 1, 0);
    playback.acceptPlayback({
      ...loaded,
      value: {
        ...loaded.value,
        session: {
          ...(loaded.value as { session: object }).session,
          item: { ...item(1), albumId },
        },
      },
    } as never);

    expect(playback.isAlbumLoaded(albumId)).toBe(true);
    expect(playback.isAlbumLoaded("ffffffffffffffffffffffffffffffff")).toBe(false);
  });

  it("feeds every accepted snapshot to the clock and ignores stale ones", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);

    playback.acceptPlayback(playing(2, 1, 0));
    playback.acceptPlayback(playing(1, 1, 0));

    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("position messages", () => {
  const position = (positionMs: number, seekRevision = 0, playbackId = 1) => ({
    playbackId,
    positionMs,
    seekRevision,
  });

  it("feed the clock without touching the snapshot", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0));
    const snapshot = playback.snapshot;
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ itemId: 1, positionMs: 250 }));
    expect(playback.snapshot).toBe(snapshot);
  });

  it("keep the playing flag the snapshot reported", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0));

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true }));
  });

  it("are ignored for another session or an older seek", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0, 1));
    accept.mockClear();

    playback.acceptPosition(position(250, 0));
    playback.acceptPosition(position(250, 1, 2));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while paused, so a tick sent before the pause cannot move the clock back", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    const paused = playing(1, 1, 1_100);
    playback.acceptPlayback({ ...paused, value: { ...paused.value, status: "paused" } } as never);
    accept.mockClear();

    playback.acceptPosition(position(1_000));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while nothing is loaded", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(stopped(1, 1));
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).not.toHaveBeenCalled();
  });

  it("arrive as the Backend's position messages", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0));
    accept.mockClear();

    playback.acceptPosition(position(500));

    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 500 }));
  });
});

describe("starting playback", () => {
  const albumContext = {
    kind: "album",
    albumId: "0f0e0d0c0b0a09080706050403020100",
  } as const;

  it("passes the context and the clicked track to the backend", async () => {
    const start = vi.fn(async () => playing(2, 3, 0));
    const playback = new Playback(fakeClient({ start }), quietClock());
    load(playback, stopped(1, null), queue(1));
    const context = {
      kind: "album",
      albumId: "0f0e0d0c0b0a09080706050403020100",
    } as const;

    await playback.start(context, 3);

    expect(start).toHaveBeenCalledWith(context, 3);
    expect(playback.item?.trackId).toBe(3);
  });

  it("rejects with SupersededError when the backend replaced the request", async () => {
    const playback = new Playback(
      fakeClient({
        start: async () => {
          throw new SupersededError({ code: "superseded" });
        },
      }),
      quietClock(),
    );
    load(playback, stopped(1, null), queue(1));

    await expect(playback.start(albumContext, null)).rejects.toBeInstanceOf(SupersededError);
    expect(playback.transportPending).toBeNull();
  });

  it("rejects with the backend's error for a real failure", async () => {
    const playback = new Playback(
      fakeClient({
        start: async () => {
          throw new PlaybackError({ code: "trackUnavailable" });
        },
      }),
      quietClock(),
    );
    load(playback, stopped(1, null), queue(1));

    await expect(playback.start(albumContext, 1)).rejects.toMatchObject({
      code: "trackUnavailable",
    });
  });
});

describe("changing the volume", () => {
  const mutedSnapshot = (): Versioned<PlaybackSnapshot> => ({
    revision: 1,
    value: { status: "stopped", base: { ...base(), muted: true }, item: null },
  });

  it("unmutes when the volume changes while muted", async () => {
    const setMuted = vi.fn(async () => stopped(3, null));
    const playback = new Playback(
      fakeClient({
        setVolume: vi.fn(async () => mutedSnapshot()),
        setMuted,
      }),
      quietClock(),
    );
    load(playback, mutedSnapshot(), queue(1));

    const change = playback.changeVolume(0.4);

    expect(playback.volume).toBe(0.4);
    await change;
    expect(setMuted).toHaveBeenCalledWith(false);
  });

  it("leaves mute alone when not muted", async () => {
    const setMuted = vi.fn(async () => stopped(3, null));
    const playback = new Playback(
      fakeClient({ setVolume: async () => stopped(2, null), setMuted }),
      quietClock(),
    );
    load(playback, stopped(1, null), queue(1));

    await playback.changeVolume(0.4);

    expect(setMuted).not.toHaveBeenCalled();
  });
});

describe("transition direction", () => {
  it("takes the direction from the session's startedBy when the item changes", async () => {
    const playback = new Playback(
      fakeClient({
        previous: async () => playing(2, 1, 0, 0, "previous"),
      }),
      quietClock(),
    );
    load(playback, playing(1, 2, 0), queue(1));

    expect(playback.transitionDirection).toBe("forward");
    await playback.previous();
    expect(playback.item?.trackId).toBe(1);
    expect(playback.transitionDirection).toBe("backward");

    // A change the player made by itself (auto-advance) goes forward again.
    playback.acceptPlayback(playing(3, 3, 0, 0, "auto"));
    expect(playback.transitionDirection).toBe("forward");
  });

  it("keeps the direction across a seek and goes forward for a jump", () => {
    const playback = new Playback(fakeClient(), quietClock());
    load(playback, playing(1, 1, 0, 0, "previous"), queue(1));
    expect(playback.transitionDirection).toBe("backward");

    playback.acceptPlayback(playing(2, 1, 5_000, 1, "previous"));
    expect(playback.transitionDirection).toBe("backward");

    playback.acceptPlayback(playing(3, 4, 0, 0, "jump"));
    expect(playback.transitionDirection).toBe("forward");
  });

  it("does not let a Previous waiting behind a Next recolour the Next in flight", async () => {
    let finishNext: (() => void) | undefined;
    let finishPrevious: (() => void) | undefined;
    const playback = new Playback(
      fakeClient({
        next: async () => {
          await new Promise<void>((resolve) => {
            finishNext = resolve;
          });
          return playing(2, 2, 0, 0, "next");
        },
        previous: async () => {
          await new Promise<void>((resolve) => {
            finishPrevious = resolve;
          });
          return playing(3, 1, 0, 0, "previous");
        },
      }),
      quietClock(),
    );
    load(playback, playing(1, 1, 0), queue(1));

    const next = playback.next();
    const previous = playback.previous();
    finishNext?.();
    await next;
    expect(playback.item?.trackId).toBe(2);
    expect(playback.transitionDirection).toBe("forward");

    finishPrevious?.();
    await previous;
    expect(playback.item?.trackId).toBe(1);
    expect(playback.transitionDirection).toBe("backward");
  });

  it("does not let a failed Previous colour the next automatic change", async () => {
    const playback = new Playback(
      fakeClient({
        previous: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
      quietClock(),
    );
    load(playback, playing(1, 2, 0), queue(1));

    await expect(playback.previous()).rejects.toEqual({ code: "trackUnavailable" });
    playback.acceptPlayback(playing(2, 3, 0));
    expect(playback.transitionDirection).toBe("forward");
  });
});
