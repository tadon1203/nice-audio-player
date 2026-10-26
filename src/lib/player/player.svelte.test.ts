import type {
  QueueItem,
  QueueItemId,
  QueueState,
  PlayerState,
  PlaybackWaveform,
  TrackId,
} from "#lib/native/bindings";
import { player } from "#lib/native/commands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackClock } from "./playback-clock.svelte";
import { Player } from "./player.svelte";

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
    restorePreviousQueue: vi.fn(),
    playQueueItem: vi.fn(),
  },
}));
vi.mock("#lib/native/commands", () => ({ player: mocks.player }));
vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));

/** The Result of a Backend call that succeeds with no value. */
const RESULT_OK = { ok: true, value: null } as const;

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

const item = (id: TrackId): QueueItem => ({
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

const stopped = (id: TrackId | null): PlayerState => ({
  status: "stopped",
  base: base(),
  item: id ? item(id) : null,
});

const loading = (id: TrackId): PlayerState => ({
  status: "loading",
  base: base(),
  item: item(id),
});

const playing = (
  id: TrackId,
  positionMs: number,
  seekCount = 0,
  startedBy: "next" | "previous" | "auto" | "jump" = "jump",
  playbackId = 1,
): PlayerState => ({
  status: "playing",
  base: base(),
  session: {
    item: item(id),
    startedBy,
    playbackId,
    positionMs,
    seekCount,
    durationMs: 60_000,
    outputDeviceName: "Speakers",
    channelConversion: "none",
    sourceFormat: "FLAC",
    sourceBitDepth: 24,
    sourceBitrateKbps: null,
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  },
});

const paused = (id: TrackId, positionMs: number): PlayerState =>
  ({
    ...playing(id, positionMs),
    status: "paused",
  }) as PlayerState;

const queueItem = (id: QueueItemId): QueueItem => ({
  queueItemId: id,
  id,
  title: "Current track",
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 120_000,
  trackNumber: null,
  discNumber: null,
  year: null,
});

const queueOf = (patch: Partial<QueueState> = {}): QueueState => ({
  version: 1,
  current: null,
  history: [],
  upcoming: [],
  upcomingCount: 0,
  repeatMode: "off",
  shuffleEnabled: false,
  ...patch,
});

/** A clock that is never asked about time; the tests that need one pass their own. */
const quietClock = (): PlaybackClock => new PlaybackClock({ now: (): number => 0 });

/** What the session routes on connect: the first transport state and queue. */
function load(playback: Player, state: PlayerState, queueState: QueueState): void {
  playback.acceptPlayback(state);
  playback.acceptQueue(queueState);
}

/** A promise the test settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("the held state", () => {
  it("replaces the held state with each push", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(playing(1, 0));
    playback.acceptPlayback(playing(1, 250));

    expect(playback.status).toBe("playing");
    expect(playback.snapshot).toEqual(playing(1, 250));
  });

  it("holds the queue as it was last pushed", () => {
    const playback = new Player(player, quietClock());

    playback.acceptQueue(queueOf({ repeatMode: "all" }));
    playback.acceptQueue(queueOf({ repeatMode: "one", version: 2 }));

    expect(playback.repeatMode).toBe("one");
    expect(playback.queueVersion).toBe(2);
  });
});

describe("commands", () => {
  it("are sent at once, without waiting for an earlier one to answer", async () => {
    const answer = deferred<null>();
    mocks.player.pause.mockReturnValue(answer.promise);
    mocks.player.resume.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    load(playback, playing(1, 0), queueOf());

    const pausing = playback.pause();
    const resuming = playback.resume();

    expect(mocks.player.pause).toHaveBeenCalledTimes(1);
    expect(mocks.player.resume).toHaveBeenCalledTimes(1);
    answer.resolve(null);
    await Promise.all([pausing, resuming]);
  });

  it("start passes the context and the clicked track to the backend", async () => {
    mocks.player.play.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    const context = {
      kind: "album",
      albumId: "0f0e0d0c0b0a09080706050403020100",
    } as const;

    await playback.start(context, 3);

    expect(mocks.player.play).toHaveBeenCalledWith(context, 3);
  });

  it("returns the backend's error for a real failure", async () => {
    mocks.player.play.mockResolvedValue({ ok: false, error: { code: "trackUnavailable" } });
    const playback = new Player(player, quietClock());

    await expect(
      playback.start({ kind: "album", albumId: "0f0e0d0c0b0a09080706050403020100" } as const, 1),
    ).resolves.toEqual({ ok: false, error: { code: "trackUnavailable" } });
  });

  it("clearing the queue resolves true when upcoming items were removed, so the caller can offer an undo", async () => {
    mocks.player.clearQueue.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    load(
      playback,
      stopped(null),
      queueOf({ current: queueItem(1), upcoming: [queueItem(2)], upcomingCount: 1 }),
    );

    await expect(playback.playerClearQueue()).resolves.toEqual({ ok: true, value: true });
  });

  it("clearing the queue resolves false when nothing was upcoming", async () => {
    mocks.player.clearQueue.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    load(playback, stopped(null), queueOf());

    await expect(playback.playerClearQueue()).resolves.toEqual({ ok: true, value: false });
  });
});

describe("loading", () => {
  it("shows the track that is loading at once, with no position", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);

    playback.acceptPlayback(loading(2));

    expect(playback.item?.id).toBe(2);
    expect(playback.status).toBe("loading");
    expect(playback.isActive).toBe(false);
    expect(accept).toHaveBeenLastCalledWith(null);
  });

  it("is the track the player bar names, and it is not playing yet", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(loading(2));

    expect(playback.activeTrackId).toBe(2);
    expect(playback.isPlaying).toBe(false);
  });
});

describe("seeking", () => {
  it("rounds to whole milliseconds", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));

    await playback.seek(1_234.56);

    expect(mocks.player.seek).toHaveBeenCalledWith(1_235);
  });

  it("sends a position past the duration as it is, for the backend to clamp", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));
    expect(playback.durationMs).toBe(60_000);

    await playback.seek(90_000);

    expect(mocks.player.seek).toHaveBeenCalledWith(90_000);
  });

  it("never sends a negative position", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 500));

    await playback.seek(-300);

    expect(mocks.player.seek).toHaveBeenCalledWith(0);
  });

  it("shows the requested position until a pushed state shows a later seek", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));

    await playback.seek(1_234);
    expect(playback.pendingSeekMs()).toBe(1_234);

    playback.acceptPlayback(playing(1, 1_500));
    expect(playback.pendingSeekMs()).toBe(1_234);

    playback.acceptPlayback(playing(1, 1_234, 1));
    expect(playback.pendingSeekMs()).toBeNull();
  });

  it("stops showing the requested position when another playback is shown", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));
    await playback.seek(1_000);

    playback.acceptPlayback(playing(2, 0, 0, "auto", 2));

    expect(playback.pendingSeekMs()).toBeNull();
  });

  it("drops the requested position when the backend refuses the seek", async () => {
    mocks.player.seek.mockResolvedValue({ ok: false, error: { code: "invalidPlaybackState" } });
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(stopped(null));

    await expect(playback.seek(1_000)).resolves.toEqual({
      ok: false,
      error: { code: "invalidPlaybackState" },
    });
    expect(playback.pendingSeekMs()).toBeNull();
  });
});

describe("failures", () => {
  const failed = (skipping: boolean, id = 1): PlayerState => ({
    status: "failed",
    base: base(),
    item: item(id),
    error: "outputDeviceUnavailable",
    skipping,
  });

  it("exposes why playback stopped, and retries through resume", async () => {
    mocks.player.resume.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(failed(false));

    expect(playback.status).toBe("failed");
    expect(playback.failure).toBe("outputDeviceUnavailable");

    await playback.resume();

    expect(mocks.player.resume).toHaveBeenCalledTimes(1);
  });

  it("is not a stop while the player moves on by itself", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(failed(true));

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
      return RESULT_OK;
    });
    mocks.player.play.mockImplementation(async () => {
      order.push("start");
      return RESULT_OK;
    });
    const playback = new Player(player, quietClock());

    await playback.shuffleAndStart(context);

    expect(order).toEqual(["shuffle", "start"]);
  });

  it("does not start when the shuffle cannot be turned on, and returns why", async () => {
    mocks.player.setShuffle.mockResolvedValue({ ok: false, error: { code: "internal" } });
    const playback = new Player(player, quietClock());

    await expect(playback.shuffleAndStart(context)).resolves.toEqual({
      ok: false,
      error: { code: "internal" },
    });
    expect(mocks.player.play).not.toHaveBeenCalled();
  });
});

describe("playback derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(playing(1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(1, 250));
    playback.acceptPlayback(playing(1, 500));

    expect(playback.item).toBe(first);
    expect(playback.durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(playing(1, 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, 0, 0, "auto", 2));

    expect(playback.item).not.toBe(first);
    expect(playback.item?.id).toBe(2);
  });

  it("keeps naming the last track while stopped and drops the session", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(playing(1, 4_000));
    playback.acceptPlayback(stopped(1));

    expect(playback.item?.id).toBe(1);
    expect(playback.isActive).toBe(false);
    expect(playback.playbackId).toBeNull();
    expect(playback.durationMs).toBeNull();
  });

  it("tells isActive and isPlaying apart: a paused track is active but not playing", () => {
    const playback = new Player(player, quietClock());

    playback.acceptPlayback(paused(1, 0));

    expect(playback.isActive).toBe(true);
    expect(playback.isPlaying).toBe(false);
  });

  it("knows whether the album's track is loaded, by its ID", () => {
    const playback = new Player(player, quietClock());
    const albumId = "0f0e0d0c0b0a09080706050403020100";
    const state = playing(1, 0);
    playback.acceptPlayback({
      ...state,
      session: {
        ...(state as { session: object }).session,
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
    } as never);

    expect(playback.isAlbumLoaded(albumId)).toBe(true);
    expect(playback.isAlbumLoaded("ffffffffffffffffffffffffffffffff")).toBe(false);
  });

  it("feeds every pushed state to the clock", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);

    playback.acceptPlayback(playing(1, 0));
    playback.acceptPlayback(playing(1, 0));

    expect(accept).toHaveBeenCalledTimes(2);
  });
});

describe("position messages", () => {
  const position = (
    positionMs: number,
    seekCount = 0,
    playbackId = 1,
  ): { playbackId: number; positionMs: number; seekCount: number } => ({
    playbackId,
    positionMs,
    seekCount,
  });

  it("feed the clock without touching the snapshot", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);
    playback.acceptPlayback(playing(1, 0));
    const snapshot = playback.snapshot;
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ itemId: 1, positionMs: 250 }));
    expect(playback.snapshot).toBe(snapshot);
  });

  it("keep the playing flag the snapshot reported", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);
    playback.acceptPlayback(playing(1, 0));

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true }));
  });

  it("are ignored for another session or an older seek", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);
    playback.acceptPlayback(playing(1, 0, 1));
    accept.mockClear();

    playback.acceptPosition(position(250, 0));
    playback.acceptPosition(position(250, 1, 2));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while paused, so a tick sent before the pause cannot move the clock back", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);
    playback.acceptPlayback(paused(1, 1_100));
    accept.mockClear();

    playback.acceptPosition(position(1_000));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while nothing is loaded", () => {
    const accept = vi.fn();
    const playback = new Player(player, { accept } as never);
    playback.acceptPlayback(stopped(1));
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).not.toHaveBeenCalled();
  });
});

describe("changing the volume", () => {
  const muted = (): PlayerState => ({
    status: "stopped",
    base: { ...base(), muted: true },
    item: null,
  });

  it("shows the requested volume at once, and clears it when the pushed volume arrives", async () => {
    mocks.player.setVolume.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(stopped(null));

    const change = playback.setVolume(0.4);

    expect(playback.volume).toBe(0.4);
    await change;
    playback.acceptPlayback({ ...stopped(null), base: { ...base(), volume: 0.4 } });
    expect(playback.volume).toBe(0.4);
    playback.acceptPlayback({ ...stopped(null), base: { ...base(), volume: 0.7 } });
    expect(playback.volume).toBe(0.7);
  });

  it("clears the requested volume when the backend refuses it", async () => {
    mocks.player.setVolume.mockResolvedValue({ ok: false, error: { code: "invalidVolume" } });
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(stopped(null));

    await expect(playback.setVolume(0.4)).resolves.toEqual({
      ok: false,
      error: { code: "invalidVolume" },
    });
    expect(playback.volume).toBe(0.5);
  });

  it("unmutes when the volume changes while muted", async () => {
    mocks.player.setVolume.mockResolvedValue(RESULT_OK);
    mocks.player.setMuted.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(muted());

    await playback.changeVolume(0.4);

    expect(mocks.player.setMuted).toHaveBeenCalledWith(false);
  });

  it("leaves mute alone when not muted", async () => {
    mocks.player.setVolume.mockResolvedValue(RESULT_OK);
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(stopped(null));

    await playback.changeVolume(0.4);

    expect(mocks.player.setMuted).not.toHaveBeenCalled();
  });
});

describe("transition direction", () => {
  it("takes the direction from the session's startedBy when the item changes", () => {
    const playback = new Player(player, quietClock());
    load(playback, playing(2, 0), queueOf());

    expect(playback.transitionDirection).toBe("forward");
    playback.acceptPlayback(playing(1, 0, 0, "previous", 2));
    expect(playback.item?.id).toBe(1);
    expect(playback.transitionDirection).toBe("backward");

    // A change the player made by itself (auto-advance) goes forward again.
    playback.acceptPlayback(playing(3, 0, 0, "auto", 3));
    expect(playback.transitionDirection).toBe("forward");
  });

  it("keeps the direction across a seek and goes forward for a jump", () => {
    const playback = new Player(player, quietClock());
    load(playback, playing(1, 0, 0, "previous"), queueOf());
    expect(playback.transitionDirection).toBe("backward");

    playback.acceptPlayback(playing(1, 5_000, 1, "previous"));
    expect(playback.transitionDirection).toBe("backward");

    playback.acceptPlayback(playing(4, 0, 0, "jump", 2));
    expect(playback.transitionDirection).toBe("forward");
  });

  it("reads a Previous from its session once the track that loaded starts playing", () => {
    const playback = new Player(player, quietClock());
    load(playback, playing(2, 0), queueOf());

    playback.acceptPlayback(loading(1));
    expect(playback.transitionDirection).toBe("forward");

    playback.acceptPlayback(playing(1, 0, 0, "previous", 3));
    expect(playback.transitionDirection).toBe("backward");
  });
});

describe("the waveform", () => {
  const waveformOf = (playbackId: number, peak: number): PlaybackWaveform => ({
    playbackId,
    rms: [peak],
  });

  it("is shown only for the playback it belongs to", () => {
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));

    playback.acceptWaveform(waveformOf(1, 5));
    expect(playback.waveform?.rms).toEqual([5]);

    playback.acceptWaveform(waveformOf(2, 7));
    expect(playback.waveform).toBeNull();
  });

  it("holds the waveform last pushed", () => {
    const playback = new Player(player, quietClock());
    playback.acceptPlayback(playing(1, 0));

    playback.acceptWaveform(waveformOf(1, 9));
    playback.acceptWaveform(waveformOf(1, 3));

    expect(playback.waveform?.rms).toEqual([3]);
  });
});
