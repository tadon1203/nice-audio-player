import type {
  PlaybackItem,
  PlaybackQueueItem,
  QueueItemId,
  QueueState,
  PlaybackState,
  PlaybackWaveform,
  Revisioned,
  TrackId,
} from "#lib/native/bindings";
import { player } from "#lib/native/commands";
import { NativeError } from "#lib/native/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackClock } from "./playback-clock.svelte";
import { Playback } from "./playback.svelte";

const mocks = vi.hoisted(() => ({
  player: {
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setShuffle: vi.fn(),
    clearQueue: vi.fn(),
  },
}));
vi.mock("#lib/native/commands", () => ({ player: mocks.player }));
vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));

beforeEach(() => {
  vi.resetAllMocks();
});

const base = (): {
  volume: number;
  muted: boolean;
  outputSelection: { kind: "systemDefault" };
  canGoPrevious: boolean;
  canGoNext: boolean;
} => ({
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
});

const item = (id: TrackId): PlaybackItem => ({
  queueItemId: id,
  id,
  title: String(id),
  artist: null,
  album: null,
  artwork: null,
  durationMs: 60_000,
  trackNumber: null,
  discNumber: null,
  year: null,
});

const stopped = (revision: number, id: TrackId | null): Revisioned<PlaybackState> => ({
  revision,
  value: { status: "stopped", base: base(), item: id ? item(id) : null },
});

const playing = (
  revision: number,
  id: TrackId,
  positionMs: number,
  seekRevision = 0,
  startedBy: "next" | "previous" | "auto" | "jump" = "jump",
): Revisioned<PlaybackState> => ({
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
  queueItemId: id,
  id,
  title: "Current track",
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 120_000,
});

const queueOf = (revision: number, patch: Partial<QueueState> = {}): Revisioned<QueueState> => ({
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

const queue = (revision: number): Revisioned<QueueState> => queueOf(revision);

/** A clock that is never asked about time; the tests that need one pass their own. */
const quietClock = (): PlaybackClock => new PlaybackClock({ now: (): number => 0 });

/** What `connect` gives the Renderer: the first snapshot and queue, as the session routes them. */
function load(
  playback: Playback,
  snapshot: Revisioned<PlaybackState>,
  queueSnapshot: Revisioned<QueueState>,
): void {
  playback.acceptPlayback(snapshot);
  playback.acceptQueue(queueSnapshot);
}

describe("playback session ordering", () => {
  it("rejects stale playback revisions", () => {
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, 1), queue(1));

    playback.acceptPlayback(stopped(0, 9));
    playback.acceptPlayback(stopped(1, 1));
    playback.acceptPlayback(stopped(2, 2));

    expect(playback.item?.id).toBe(2);
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(stopped(50, null));
    playback.acceptQueue(queueOf(2, { current: queueItem(1) }));

    expect(playback.queueRevision).toBe(2);
    expect(playback.queue?.current?.title).toBe("Current track");
  });

  it("drops a command response older than the state it follows", async () => {
    mocks.player.pause.mockResolvedValue(stopped(2, 1));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, 1), queue(1));
    playback.acceptPlayback(stopped(3, 2));

    await playback.pause();

    expect(playback.item?.id).toBe(2);
  });

  it("drops a queue command response older than the queue it follows", async () => {
    mocks.player.setShuffle.mockResolvedValue(queueOf(2, { shuffleEnabled: false }));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queueOf(3, { shuffleEnabled: true }));

    await playback.setShuffle(false);

    expect(playback.shuffleEnabled).toBe(true);
    expect(playback.queueRevision).toBe(3);
  });

  it("coalesces volume writes without blocking transport or seek", async () => {
    let releaseFirstVolume: (() => void) | undefined;
    const volumeCalls: number[] = [];
    let volumeRevision = 2;
    mocks.player.setVolume.mockImplementation(async (value: number) => {
      volumeCalls.push(value);
      if (volumeCalls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstVolume = resolve;
        });
      }
      return stopped(volumeRevision++, null);
    });
    mocks.player.pause.mockResolvedValue(stopped(10, null));
    mocks.player.seek.mockResolvedValue(stopped(11, null));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    const first = playback.setVolume(0.2);
    const second = playback.setVolume(0.8);
    expect(playback.volumePending).toBe(true);
    expect(playback.volume).toBe(0.8);
    expect(volumeCalls).toEqual([0.2]);

    await Promise.all([playback.pause(), playback.seek(1000)]);
    expect(mocks.player.pause).toHaveBeenCalledTimes(1);
    expect(mocks.player.seek).toHaveBeenCalledWith(1000);

    releaseFirstVolume?.();
    await Promise.all([first, second]);
    expect(volumeCalls).toEqual([0.2, 0.8]);
    expect(playback.volumePending).toBe(false);
  });

  it("replaces the transport command waiting behind one in flight as superseded", async () => {
    let releasePause: (() => void) | undefined;
    mocks.player.pause.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releasePause = resolve;
      });
      return stopped(2, null);
    });
    mocks.player.resume.mockResolvedValue(stopped(3, null));
    mocks.player.next.mockResolvedValue(stopped(4, null));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    const first = playback.pause();
    const replaced = playback.resume();
    const latest = playback.next();
    expect(playback.transportPending).toBe("pause");
    await expect(replaced).rejects.toMatchObject({ error: { code: "superseded" } });
    expect(mocks.player.resume).not.toHaveBeenCalled();
    expect(mocks.player.next).not.toHaveBeenCalled();

    releasePause?.();
    await first;
    await expect(latest).resolves.toBeUndefined();
    expect(mocks.player.next).toHaveBeenCalledTimes(1);
    expect(mocks.player.resume).not.toHaveBeenCalled();
    expect(playback.transportPending).toBeNull();
  });

  it("does not delay a seek or a volume change behind a transport command", async () => {
    let releaseStart: (() => void) | undefined;
    mocks.player.play.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releaseStart = resolve;
      });
      return playing(2, 1, 0);
    });
    mocks.player.seek.mockResolvedValue(playing(3, 1, 1_000));
    mocks.player.setVolume.mockResolvedValue(playing(4, 1, 0));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));
    playback.acceptPlayback(playing(1, 1, 0));

    const start = playback.start({ kind: "tracks" } as never, 1);
    const seeking = playback.seek(1_000);
    const volume = playback.setVolume(0.2);

    await vi.waitFor(() => expect(mocks.player.seek).toHaveBeenCalledWith(1_000));
    await vi.waitFor(() => expect(mocks.player.setVolume).toHaveBeenCalledWith(0.2));
    releaseStart?.();
    await Promise.all([start, seeking, volume]);
  });
});

describe("clearing the queue", () => {
  const withUpcoming = (revision: number): Revisioned<QueueState> =>
    queueOf(revision, {
      current: queueItem(1),
      upcoming: [queueItem(2)],
      upcomingCount: 1,
    });

  it("resolves true when upcoming items were removed, so the caller can offer an undo", async () => {
    mocks.player.clearQueue.mockResolvedValue(queue(2));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), withUpcoming(1));

    await expect(playback.playerClearQueue()).resolves.toBe(true);
  });

  it("resolves false when nothing was upcoming", async () => {
    mocks.player.clearQueue.mockResolvedValue(queue(2));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    await expect(playback.playerClearQueue()).resolves.toBe(false);
  });
});

describe("seeking", () => {
  it("rounds to whole milliseconds", async () => {
    mocks.player.seek.mockResolvedValue(playing(2, 1, 1_000));
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(playing(1, 1, 0));

    await playback.seek(1_234.56);

    expect(mocks.player.seek).toHaveBeenCalledWith(1_235);
  });

  it("sends a position past the duration as it is, for the backend to clamp", async () => {
    mocks.player.seek.mockResolvedValue(playing(2, 1, 60_000));
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(playing(1, 1, 0));
    expect(playback.durationMs).toBe(60_000);

    await playback.seek(90_000);

    expect(mocks.player.seek).toHaveBeenCalledWith(90_000);
  });

  it("never sends a negative position", async () => {
    mocks.player.seek.mockResolvedValue(playing(2, 1, 0));
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(playing(1, 1, 500));

    await playback.seek(-300);

    expect(mocks.player.seek).toHaveBeenCalledWith(0);
  });
});

describe("failures", () => {
  const failed = (revision: number, skipping: boolean, id = 1): Revisioned<PlaybackState> => ({
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
    mocks.player.resume.mockResolvedValue(playing(3, 1, 0));
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(failed(2, false));

    expect(playback.status).toBe("failed");
    expect(playback.failure).toBe("outputDeviceUnavailable");

    await playback.resume();

    expect(mocks.player.resume).toHaveBeenCalledTimes(1);
    expect(playback.failure).toBeNull();
  });

  it("is not a stop while the player moves on by itself", () => {
    const playback = new Playback(player, quietClock());

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
    mocks.player.setShuffle.mockImplementation(async () => {
      order.push("shuffle");
      return queueOf(2, { shuffleEnabled: true });
    });
    mocks.player.play.mockImplementation(async () => {
      order.push("start");
      return playing(2, 1, 0);
    });
    const playback = new Playback(player, quietClock());

    await playback.shuffleAndStart(context);

    expect(order).toEqual(["shuffle", "start"]);
    expect(playback.shuffleEnabled).toBe(true);
  });

  it("does not start when the shuffle cannot be turned on, and throws why", async () => {
    mocks.player.setShuffle.mockImplementation(async () => {
      throw { code: "workerUnavailable" };
    });
    const playback = new Playback(player, quietClock());

    await expect(playback.shuffleAndStart(context)).rejects.toEqual({ code: "workerUnavailable" });
    expect(mocks.player.play).not.toHaveBeenCalled();
  });
});

describe("playback session derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const playback = new Playback(player, quietClock());

    playback.acceptPlayback(playing(1, 1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, 1, 250));
    playback.acceptPlayback(playing(3, 1, 500));

    expect(playback.item).toBe(first);
    expect(playback.durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const playback = new Playback(player, quietClock());

    playback.acceptPlayback(playing(1, 1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, 2, 0));

    expect(playback.item).not.toBe(first);
    expect(playback.item?.id).toBe(2);
  });

  it("keeps naming the last track while stopped and drops the session", () => {
    const playback = new Playback(player, quietClock());

    playback.acceptPlayback(playing(1, 1, 4_000));
    playback.acceptPlayback(stopped(2, 1));

    expect(playback.item?.id).toBe(1);
    expect(playback.isActive).toBe(false);
    expect(playback.playbackId).toBeNull();
    expect(playback.durationMs).toBeNull();
  });

  it("tells isActive and isPlaying apart: a paused track is active but not playing", () => {
    const playback = new Playback(player, quietClock());
    const paused = playing(1, 1, 0);
    playback.acceptPlayback({ ...paused, value: { ...paused.value, status: "paused" } } as never);

    expect(playback.isActive).toBe(true);
    expect(playback.isPlaying).toBe(false);
  });

  it("knows whether the album's track is loaded, by its ID", () => {
    const playback = new Playback(player, quietClock());
    const albumId = "0f0e0d0c0b0a09080706050403020100";
    const loaded = playing(1, 1, 0);
    playback.acceptPlayback({
      ...loaded,
      value: {
        ...loaded.value,
        session: {
          ...(loaded.value as { session: object }).session,
          item: {
            ...item(1),
            album: {
              id: albumId,
              title: "Album",
              artist: { id: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99", name: "Band" },
              trackCount: 1,
            },
          },
        },
      },
    } as never);

    expect(playback.isAlbumLoaded(albumId)).toBe(true);
    expect(playback.isAlbumLoaded("ffffffffffffffffffffffffffffffff")).toBe(false);
  });

  it("feeds every accepted snapshot to the clock and ignores stale ones", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);

    playback.acceptPlayback(playing(2, 1, 0));
    playback.acceptPlayback(playing(1, 1, 0));

    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("position messages", () => {
  const position = (
    positionMs: number,
    seekRevision = 0,
    playbackId = 1,
  ): { playbackId: number; positionMs: number; seekRevision: number } => ({
    playbackId,
    positionMs,
    seekRevision,
  });

  it("feed the clock without touching the snapshot", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);
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
    const playback = new Playback(player, { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0));

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true }));
  });

  it("are ignored for another session or an older seek", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);
    playback.acceptPlayback(playing(1, 1, 0, 1));
    accept.mockClear();

    playback.acceptPosition(position(250, 0));
    playback.acceptPosition(position(250, 1, 2));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while paused, so a tick sent before the pause cannot move the clock back", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);
    const paused = playing(1, 1, 1_100);
    playback.acceptPlayback({ ...paused, value: { ...paused.value, status: "paused" } } as never);
    accept.mockClear();

    playback.acceptPosition(position(1_000));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while nothing is loaded", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);
    playback.acceptPlayback(stopped(1, 1));
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).not.toHaveBeenCalled();
  });

  it("arrive as the Backend's position messages", () => {
    const accept = vi.fn();
    const playback = new Playback(player, { accept } as never);
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
    mocks.player.play.mockResolvedValue(playing(2, 3, 0));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));
    const context = {
      kind: "album",
      albumId: "0f0e0d0c0b0a09080706050403020100",
    } as const;

    await playback.start(context, 3);

    expect(mocks.player.play).toHaveBeenCalledWith(context, 3);
    expect(playback.item?.id).toBe(3);
  });

  it("rejects as superseded when the backend replaced the request", async () => {
    mocks.player.play.mockImplementation(async () => {
      throw new NativeError("player", { code: "superseded" });
    });
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    await expect(playback.start(albumContext, null)).rejects.toMatchObject({
      error: { code: "superseded" },
    });
    expect(playback.transportPending).toBeNull();
  });

  it("rejects with the backend's error for a real failure", async () => {
    mocks.player.play.mockImplementation(async () => {
      throw new NativeError("player", { code: "trackUnavailable" });
    });
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    await expect(playback.start(albumContext, 1)).rejects.toMatchObject({
      error: { code: "trackUnavailable" },
    });
  });
});

describe("changing the volume", () => {
  const mutedSnapshot = (): Revisioned<PlaybackState> => ({
    revision: 1,
    value: { status: "stopped", base: { ...base(), muted: true }, item: null },
  });

  it("unmutes when the volume changes while muted", async () => {
    mocks.player.setVolume.mockResolvedValue(mutedSnapshot());
    mocks.player.setMuted.mockResolvedValue(stopped(3, null));
    const playback = new Playback(player, quietClock());
    load(playback, mutedSnapshot(), queue(1));

    const change = playback.changeVolume(0.4);

    expect(playback.volume).toBe(0.4);
    await change;
    expect(mocks.player.setMuted).toHaveBeenCalledWith(false);
  });

  it("leaves mute alone when not muted", async () => {
    mocks.player.setVolume.mockResolvedValue(stopped(2, null));
    mocks.player.setMuted.mockResolvedValue(stopped(3, null));
    const playback = new Playback(player, quietClock());
    load(playback, stopped(1, null), queue(1));

    await playback.changeVolume(0.4);

    expect(mocks.player.setMuted).not.toHaveBeenCalled();
  });
});

describe("transition direction", () => {
  it("takes the direction from the session's startedBy when the item changes", async () => {
    mocks.player.previous.mockResolvedValue(playing(2, 1, 0, 0, "previous"));
    const playback = new Playback(player, quietClock());
    load(playback, playing(1, 2, 0), queue(1));

    expect(playback.transitionDirection).toBe("forward");
    await playback.previous();
    expect(playback.item?.id).toBe(1);
    expect(playback.transitionDirection).toBe("backward");

    // A change the player made by itself (auto-advance) goes forward again.
    playback.acceptPlayback(playing(3, 3, 0, 0, "auto"));
    expect(playback.transitionDirection).toBe("forward");
  });

  it("keeps the direction across a seek and goes forward for a jump", () => {
    const playback = new Playback(player, quietClock());
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
    mocks.player.next.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishNext = resolve;
      });
      return playing(2, 2, 0, 0, "next");
    });
    mocks.player.previous.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishPrevious = resolve;
      });
      return playing(3, 1, 0, 0, "previous");
    });
    const playback = new Playback(player, quietClock());
    load(playback, playing(1, 1, 0), queue(1));

    const next = playback.next();
    const previous = playback.previous();
    finishNext?.();
    await next;
    expect(playback.item?.id).toBe(2);
    expect(playback.transitionDirection).toBe("forward");

    finishPrevious?.();
    await previous;
    expect(playback.item?.id).toBe(1);
    expect(playback.transitionDirection).toBe("backward");
  });

  it("does not let a failed Previous colour the next automatic change", async () => {
    mocks.player.previous.mockImplementation(async () => {
      throw { code: "common", error: { code: "trackUnavailable" } };
    });
    const playback = new Playback(player, quietClock());
    load(playback, playing(1, 2, 0), queue(1));

    await expect(playback.previous()).rejects.toEqual({
      code: "common",
      error: { code: "trackUnavailable" },
    });
    playback.acceptPlayback(playing(2, 3, 0));
    expect(playback.transitionDirection).toBe("forward");
  });
});

describe("the waveform", () => {
  const waveformOf = (
    playbackId: number,
    revision: number,
    peak: number,
  ): Revisioned<PlaybackWaveform | null> => ({
    revision,
    value: { playbackId, peaks: [peak], rms: [peak] },
  });

  it("is shown only for the playback it belongs to", () => {
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(playing(1, 1, 0));

    playback.acceptWaveform(waveformOf(1, 1, 5));
    expect(playback.waveform?.peaks).toEqual([5]);

    playback.acceptWaveform(waveformOf(2, 2, 7));
    expect(playback.waveform).toBeNull();
  });

  it("drops a waveform older than the one held", () => {
    const playback = new Playback(player, quietClock());
    playback.acceptPlayback(playing(1, 1, 0));

    playback.acceptWaveform(waveformOf(1, 5, 9));
    playback.acceptWaveform(waveformOf(1, 4, 3));

    expect(playback.waveform?.peaks).toEqual([9]);
  });
});
