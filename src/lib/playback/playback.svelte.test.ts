import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SupersededError,
  type PlaybackClient,
  type PlaybackItem,
  type PlaybackQueueItem,
  type PlaybackQueueSnapshot,
  type PlaybackSnapshot,
  type Versioned,
} from "#lib/native";
import { Playback } from "./playback.svelte";

const base = () => ({
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
});

const item = (id: string): PlaybackItem => ({
  queueItemId: `queue-${id}`,
  trackId: id,
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

const stopped = (revision: number, id: string | null): Versioned<PlaybackSnapshot> => ({
  revision,
  value: { status: "stopped", base: base(), item: id ? item(id) : null },
});

const playing = (
  revision: number,
  id: string,
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
      playbackId: "1",
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

const queueItem = (id: string): PlaybackQueueItem => ({
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
    const playback = new Playback(fakeClient());
    load(playback, stopped(1, "a"), queue(1));

    playback.acceptPlayback(stopped(0, "stale"));
    playback.acceptPlayback(stopped(1, "a"));
    playback.acceptPlayback(stopped(2, "b"));

    expect(playback.playbackRevision).toBe(2);
    expect(playback.item?.trackId).toBe("b");
  });

  it("accepts queue revisions independently from playback revisions", () => {
    const playback = new Playback(fakeClient());
    playback.acceptPlayback(stopped(50, null));
    playback.acceptQueue(queueOf(2, { current: queueItem("track-1") }));

    expect(playback.playbackRevision).toBe(50);
    expect(playback.queueRevision).toBe(2);
    expect(playback.queue?.current?.title).toBe("Current track");
  });

  it("drops a command response older than the state it follows", async () => {
    const playback = new Playback(fakeClient({ pause: vi.fn(async () => stopped(2, "a")) }));
    load(playback, stopped(1, "a"), queue(1));
    playback.acceptPlayback(stopped(3, "b"));

    await playback.pause();

    expect(playback.item?.trackId).toBe("b");
    expect(playback.playbackRevision).toBe(3);
  });

  it("drops a queue command response older than the queue it follows", async () => {
    const playback = new Playback(
      fakeClient({
        setShuffle: vi.fn(async () => queueOf(2, { shuffleEnabled: false })),
      }),
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
    const playback = new Playback(client);
    load(playback, stopped(1, null), queue(1));

    playback.setVolume(0.2);
    playback.setVolume(0.8);
    expect(playback.volumePending).toBe(true);
    expect(playback.volume).toBe(0.8);
    expect(volumeCalls).toEqual([0.2]);

    await Promise.all([playback.pause(), playback.seek(1000)]);
    expect(client.pause).toHaveBeenCalledTimes(1);
    expect(client.seek).toHaveBeenCalledWith(1000);

    releaseFirstVolume?.();
    await vi.waitFor(() => expect(volumeCalls).toEqual([0.2, 0.8]));
    await vi.waitFor(() => expect(playback.volumePending).toBe(false));
  });

  it("keeps only the latest transport command that arrives while one is in flight", async () => {
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
    const playback = new Playback(client);
    load(playback, stopped(1, null), queue(1));

    const first = playback.pause();
    const replaced = playback.resume();
    const latest = playback.next();
    expect(playback.transportPending).toBe("pause");
    expect(await replaced).toBe(false);
    expect(client.resume).not.toHaveBeenCalled();
    expect(client.next).not.toHaveBeenCalled();

    releasePause?.();
    await first;
    expect(await latest).toBe(true);
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
        return playing(2, "a", 0);
      }),
      seek: vi.fn(async () => playing(3, "a", 1_000)),
      setVolume: vi.fn(async () => playing(4, "a", 0)),
    });
    const playback = new Playback(client);
    load(playback, stopped(1, null), queue(1));
    playback.acceptPlayback(playing(1, "a", 0));

    const start = playback.startPlayback({ kind: "tracks" } as never, "a");
    void playback.seek(1_000);
    playback.setVolume(0.2);

    await vi.waitFor(() => expect(client.seek).toHaveBeenCalledWith(1_000));
    await vi.waitFor(() => expect(client.setVolume).toHaveBeenCalledWith(0.2));
    releaseStart?.();
    await start;
  });
});

describe("undoing a queue change", () => {
  afterEach(() => vi.useRealTimers());

  const withUpcoming = (revision: number) =>
    queueOf(revision, {
      current: queueItem("a"),
      upcoming: [queueItem("b")],
      upcomingCount: 1,
    });

  it("is offered after clearing upcoming, and goes away after a while", async () => {
    vi.useFakeTimers();
    const playback = new Playback(
      fakeClient({
        clearQueue: vi.fn(async () => queue(2)),
      }),
    );
    load(playback, stopped(1, null), withUpcoming(1));

    await playback.clearQueue();
    expect(playback.undoOffer).toBe("Upcoming cleared");

    vi.advanceTimersByTime(6_000);
    expect(playback.undoOffer).toBeNull();
  });
});

describe("seeking", () => {
  it("rounds to whole milliseconds", async () => {
    const seek = vi.fn(async () => playing(2, "a", 1_000));
    const playback = new Playback(fakeClient({ seek }));
    playback.acceptPlayback(playing(1, "a", 0));

    await playback.seek(1_234.56);

    expect(seek).toHaveBeenCalledWith(1_235);
  });
});

describe("failures", () => {
  const failed = (revision: number, skipping: boolean, id = "a"): Versioned<PlaybackSnapshot> => ({
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
    const resume = vi.fn(async () => playing(3, "a", 0));
    const playback = new Playback(fakeClient({ resume }));
    playback.acceptPlayback(failed(2, false));

    expect(playback.status).toBe("failed");
    expect(playback.failure).toBe("outputDeviceUnavailable");

    await playback.resume();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(playback.failure).toBeNull();
  });

  it("is not a stop while the player moves on by itself", () => {
    const playback = new Playback(fakeClient());

    playback.acceptPlayback(failed(2, true));

    expect(playback.failure).toBeNull();
  });

  describe("skipped tracks", () => {
    afterEach(() => vi.useRealTimers());

    it("are told by the occurrence, and consecutive skips share the notice", () => {
      vi.useFakeTimers();
      const playback = new Playback(fakeClient());

      playback.acceptSkip("a");
      expect(playback.notice).toBe("Couldn't play a, skipped");
      playback.acceptSkip("b");
      playback.acceptSkip("c");
      expect(playback.notice).toBe("Couldn't play a and 2 more, skipped");

      vi.advanceTimersByTime(6_000);
      expect(playback.notice).toBeNull();
      playback.acceptSkip("d");
      expect(playback.notice).toBe("Couldn't play d, skipped");
    });

    it("names a track that had no title as a track", () => {
      const playback = new Playback(fakeClient());

      playback.acceptSkip(null);

      expect(playback.notice).toBe("Couldn't play a track, skipped");
    });

    it("is not told by the snapshot alone, which only says the player is moving on", () => {
      const playback = new Playback(fakeClient());

      playback.acceptPlayback(failed(1, true, "a"));

      expect(playback.notice).toBeNull();
    });
  });
});

describe("album shuffle", () => {
  const context = {
    kind: "album",
    key: { title: "A", albumArtist: "B", albumEdition: "" },
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
          return playing(2, "a", 0);
        }),
      }),
    );

    await playback.shuffleAndStart(context);

    expect(order).toEqual(["shuffle", "start"]);
    expect(playback.shuffleEnabled).toBe(true);
  });

  it("does not start when the shuffle cannot be turned on, and says why", async () => {
    const start = vi.fn(async () => playing(2, "a", 0));
    const playback = new Playback(
      fakeClient({
        setShuffle: async () => {
          throw { code: "workerUnavailable" };
        },
        start,
      }),
    );

    await playback.shuffleAndStart(context);

    expect(start).not.toHaveBeenCalled();
    expect(playback.error).toBe("The playback engine is unavailable.");
  });
});

describe("playback session derived state", () => {
  it("keeps the same item object while position ticks arrive", () => {
    const playback = new Playback(fakeClient());

    playback.acceptPlayback(playing(1, "a", 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, "a", 250));
    playback.acceptPlayback(playing(3, "a", 500));

    expect(playback.item).toBe(first);
    expect(playback.durationMs).toBe(60_000);
  });

  it("replaces the item when another queue item starts", () => {
    const playback = new Playback(fakeClient());

    playback.acceptPlayback(playing(1, "a", 0));
    const first = playback.item;
    playback.acceptPlayback(playing(2, "b", 0));

    expect(playback.item).not.toBe(first);
    expect(playback.item?.trackId).toBe("b");
  });

  it("keeps naming the last track while stopped and drops the session", () => {
    const playback = new Playback(fakeClient());

    playback.acceptPlayback(playing(1, "a", 4_000));
    playback.acceptPlayback(stopped(2, "a"));

    expect(playback.item?.trackId).toBe("a");
    expect(playback.playbackId).toBeNull();
    expect(playback.durationMs).toBeNull();
  });

  it("feeds every accepted snapshot to the clock and ignores stale ones", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);

    playback.acceptPlayback(playing(2, "a", 0));
    playback.acceptPlayback(playing(1, "a", 0));

    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("position messages", () => {
  const position = (positionMs: number, seekRevision = 0, playbackId = "1") => ({
    playbackId,
    positionMs,
    seekRevision,
  });

  it("feed the clock without touching the snapshot", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, "a", 0));
    const snapshot = playback.snapshot;
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "queue-a", positionMs: 250 }),
    );
    expect(playback.snapshot).toBe(snapshot);
  });

  it("keep the playing flag the snapshot reported", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, "a", 0));

    playback.acceptPosition(position(250));

    expect(accept).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true }));
  });

  it("are ignored for another session or an older seek", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, "a", 0, 1));
    accept.mockClear();

    playback.acceptPosition(position(250, 0));
    playback.acceptPosition(position(250, 1, "other"));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while paused, so a tick sent before the pause cannot move the clock back", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    const paused = playing(1, "a", 1_100);
    playback.acceptPlayback({ ...paused, value: { ...paused.value, status: "paused" } } as never);
    accept.mockClear();

    playback.acceptPosition(position(1_000));

    expect(accept).not.toHaveBeenCalled();
  });

  it("are ignored while nothing is loaded", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(stopped(1, "a"));
    accept.mockClear();

    playback.acceptPosition(position(250));

    expect(accept).not.toHaveBeenCalled();
  });

  it("arrive as the Backend's position messages", () => {
    const accept = vi.fn();
    const playback = new Playback(fakeClient(), { accept } as never);
    playback.acceptPlayback(playing(1, "a", 0));
    accept.mockClear();

    playback.acceptPosition(position(500));

    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 500 }));
  });
});

describe("starting playback", () => {
  it("passes the context and the clicked track to the backend", async () => {
    const start = vi.fn(async () => playing(2, "c", 0));
    const playback = new Playback(fakeClient({ start }));
    load(playback, stopped(1, null), queue(1));
    const context = {
      kind: "album",
      key: { title: "Album", albumArtist: "Artist", albumEdition: "" },
    } as const;

    await playback.startPlayback(context, "c");

    expect(start).toHaveBeenCalledWith(context, "c");
    expect(playback.item?.trackId).toBe("c");
  });

  it("does not report a request that a newer one replaced", async () => {
    const playback = new Playback(
      fakeClient({
        start: async () => {
          throw new SupersededError({ code: "superseded" });
        },
      }),
    );
    load(playback, stopped(1, null), queue(1));

    await playback.startPlayback(
      { kind: "album", key: { title: "A", albumArtist: "B", albumEdition: "" } },
      null,
    );

    expect(playback.error).toBeNull();
    expect(playback.transportPending).toBeNull();
  });

  it("reports a real failure", async () => {
    const playback = new Playback(
      fakeClient({
        start: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    load(playback, stopped(1, null), queue(1));

    await playback.startPlayback(
      { kind: "album", key: { title: "A", albumArtist: "B", albumEdition: "" } },
      "1",
    );

    expect(playback.error).toBe("That track is unavailable on disk.");
  });

  it("clears a reported failure on request", async () => {
    const playback = new Playback(
      fakeClient({
        start: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    load(playback, stopped(1, null), queue(1));
    await playback.startPlayback(
      { kind: "album", key: { title: "A", albumArtist: "B", albumEdition: "" } },
      "1",
    );
    expect(playback.error).not.toBeNull();

    playback.clearError();

    expect(playback.error).toBeNull();
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
    );
    load(playback, mutedSnapshot(), queue(1));

    playback.changeVolume(0.4);

    expect(playback.volume).toBe(0.4);
    expect(setMuted).toHaveBeenCalledWith(false);
  });

  it("leaves mute alone when not muted", async () => {
    const setMuted = vi.fn(async () => stopped(3, null));
    const playback = new Playback(
      fakeClient({ setVolume: async () => stopped(2, null), setMuted }),
    );
    load(playback, stopped(1, null), queue(1));

    playback.changeVolume(0.4);

    expect(setMuted).not.toHaveBeenCalled();
  });
});

describe("last navigation", () => {
  it("takes the direction from the session's startedBy when the item changes", async () => {
    const playback = new Playback(
      fakeClient({
        previous: async () => playing(2, "a", 0, 0, "previous"),
      }),
    );
    load(playback, playing(1, "b", 0), queue(1));

    expect(playback.lastNavigation).toBe("next");
    await playback.previous();
    expect(playback.item?.trackId).toBe("a");
    expect(playback.lastNavigation).toBe("previous");

    // A change the player made by itself (auto-advance) goes forward again.
    playback.acceptPlayback(playing(3, "c", 0, 0, "auto"));
    expect(playback.lastNavigation).toBe("next");
  });

  it("keeps the direction across a seek and goes forward for a jump", () => {
    const playback = new Playback(fakeClient());
    load(playback, playing(1, "a", 0, 0, "previous"), queue(1));
    expect(playback.lastNavigation).toBe("previous");

    playback.acceptPlayback(playing(2, "a", 5_000, 1, "previous"));
    expect(playback.lastNavigation).toBe("previous");

    playback.acceptPlayback(playing(3, "d", 0, 0, "jump"));
    expect(playback.lastNavigation).toBe("next");
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
          return playing(2, "b", 0, 0, "next");
        },
        previous: async () => {
          await new Promise<void>((resolve) => {
            finishPrevious = resolve;
          });
          return playing(3, "a", 0, 0, "previous");
        },
      }),
    );
    load(playback, playing(1, "a", 0), queue(1));

    const next = playback.next();
    const previous = playback.previous();
    finishNext?.();
    await next;
    expect(playback.item?.trackId).toBe("b");
    expect(playback.lastNavigation).toBe("next");

    finishPrevious?.();
    await previous;
    expect(playback.item?.trackId).toBe("a");
    expect(playback.lastNavigation).toBe("previous");
  });

  it("does not let a failed Previous colour the next automatic change", async () => {
    const playback = new Playback(
      fakeClient({
        previous: async () => {
          throw { code: "trackUnavailable" };
        },
      }),
    );
    load(playback, playing(1, "b", 0), queue(1));

    await playback.previous();
    playback.acceptPlayback(playing(2, "c", 0));
    expect(playback.lastNavigation).toBe("next");
  });
});
