import { QueryClient } from "@tanstack/svelte-query";
import type {
  CurrentPlayback,
  PlaybackWaveform,
  PlayerState,
  QueueItem,
  QueueState,
  TrackId,
} from "#lib/native/bindings";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    clearQueue: vi.fn(),
    queueWindow: vi.fn(),
  },
}));
vi.mock("#lib/native/commands", () => ({ player: mocks.player }));

/** The Result of a Backend call that succeeds with no value. */
const RESULT_OK = { ok: true, value: null } as const;

beforeEach(() => {
  vi.resetAllMocks();
});

const base = (volume = 0.5): PlayerState["base"] => ({
  volume,
  muted: false,
  outputSelection: { kind: "systemDefault" },
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

const session = (id: TrackId, overrides: Partial<CurrentPlayback> = {}): CurrentPlayback =>
  ({
    item: item(id),
    startedBy: "jump",
    playbackId: 1,
    positionMs: 0,
    seekCount: 0,
    durationMs: 60_000,
    ...overrides,
  }) as CurrentPlayback;

const playing = (id: TrackId, overrides: Partial<CurrentPlayback> = {}): PlayerState => ({
  status: "playing",
  base: base(),
  session: session(id, overrides),
});

const queueOf = (version: number, upcomingCount = 0): QueueState => ({
  version,
  current: null,
  history: [],
  upcoming: [],
  upcomingCount,
  repeatMode: "off",
  shuffleEnabled: false,
});

/** A Player with its own query client and a spy for the undo offer. */
function setUp(): { player: Player; offerUndo: ReturnType<typeof vi.fn> } {
  const offerUndo = vi.fn();
  const player = new Player({
    player: mocks.player as never,
    queryClient: new QueryClient(),
    notices: { offerUndo },
  });
  return { player, offerUndo };
}

describe("Player.item", () => {
  it("shows the loading track, then the playing track", () => {
    const { player } = setUp();
    player.acceptState({ status: "loading", base: base(), item: item(7) });
    expect(player.item?.id).toBe(7);
    player.acceptState(playing(8));
    expect(player.item?.id).toBe(8);
  });

  it("keeps the last track while stopped and while failed", () => {
    const { player } = setUp();
    player.acceptState(playing(8));
    player.acceptState({ status: "stopped", base: base(), item: item(8) });
    expect(player.item?.id).toBe(8);
    player.acceptState({
      status: "failed",
      base: base(),
      item: item(9),
      error: "outputFailed",
      skipping: false,
    });
    expect(player.item?.id).toBe(9);
    expect(player.failure).toBe("outputFailed");
  });

  it("shows the paused track and reports the direction of a Previous start", () => {
    const { player } = setUp();
    expect(player.transitionDirection).toBe("none");
    player.acceptState({
      status: "paused",
      base: base(),
      session: session(4, { startedBy: "previous" }),
    });
    expect(player.item?.id).toBe(4);
    expect(player.transitionDirection).toBe("backward");
  });

  it("replaces the held item when a re-pushed item has new fields", () => {
    const { player } = setUp();
    player.acceptState(playing(8));
    const renamed = { ...item(8), title: "Renamed" };
    player.acceptState({
      status: "playing",
      base: base(),
      session: { ...session(8), item: renamed },
    });
    expect(player.item?.title).toBe("Renamed");
  });

  it("keeps its identity while the same queue item plays", () => {
    const { player } = setUp();
    player.acceptState(playing(8, { positionMs: 0 }));
    const first = player.item;
    player.acceptState(playing(8, { positionMs: 5_000, seekCount: 1 }));
    expect(player.item).toBe(first);
  });
});

describe("Player commands", () => {
  it("sends two quick next() calls as two Commands", async () => {
    mocks.player.next.mockResolvedValue(RESULT_OK);
    const { player } = setUp();
    await Promise.all([player.next(), player.next()]);
    expect(mocks.player.next).toHaveBeenCalledTimes(2);
  });

  it("unmutes when the volume changes while muted", async () => {
    mocks.player.setVolume.mockResolvedValue(RESULT_OK);
    mocks.player.setMuted.mockResolvedValue(RESULT_OK);
    const { player } = setUp();
    player.acceptState({ ...playing(1), base: { ...base(), muted: true } });
    await player.setVolume(0.4);
    expect(mocks.player.setVolume).toHaveBeenCalledWith(0.4);
    expect(mocks.player.setMuted).toHaveBeenCalledWith(false);
  });

  it("clears the seek and volume previews when the matching state arrives", async () => {
    mocks.player.seek.mockResolvedValue(RESULT_OK);
    mocks.player.setVolume.mockResolvedValue(RESULT_OK);
    const { player } = setUp();
    player.acceptState(playing(1));
    await player.seek(30_000.4);
    expect(player.pendingSeekMs).toBe(30_000);
    player.acceptState(playing(1, { positionMs: 30_000, seekCount: 1 }));
    expect(player.pendingSeekMs).toBeUndefined();

    await player.setVolume(0.25);
    expect(player.volume).toBe(0.25);
    player.acceptState({ ...playing(1), base: base(0.25) });
    expect(player.volumePreview).toBeUndefined();
  });

  it("drops a refused seek at once", async () => {
    mocks.player.seek.mockResolvedValue({ ok: false, error: { code: "internal" } });
    const { player } = setUp();
    player.acceptState(playing(1));
    await player.seek(1_000);
    expect(player.pendingSeekMs).toBeUndefined();
  });
});

describe("Player.clearUpcoming", () => {
  it("offers Undo only when there were upcoming items", async () => {
    mocks.player.clearQueue.mockResolvedValue(RESULT_OK);
    const { player, offerUndo } = setUp();

    player.acceptQueue(queueOf(1, 0));
    await player.clearUpcoming();
    expect(offerUndo).not.toHaveBeenCalled();

    player.acceptQueue(queueOf(2, 3));
    await player.clearUpcoming();
    expect(offerUndo).toHaveBeenCalledTimes(1);
  });
});

describe("Player.waveform", () => {
  it("is undefined when the waveform belongs to another playback", () => {
    const { player } = setUp();
    player.acceptState(playing(1, { playbackId: 5 }));
    const waveform: PlaybackWaveform = { playbackId: 4, rms: [1, 2] };
    player.acceptWaveform(waveform);
    expect(player.waveform).toBeUndefined();

    player.acceptWaveform({ playbackId: 5, rms: [1, 2] });
    expect(player.waveform?.playbackId).toBe(5);
  });
});

describe("Player.queueWindowOptions", () => {
  it("is keyed by the queue version and is disabled before the first queue state", () => {
    const { player } = setUp();
    expect(player.queueWindowOptions(0).enabled).toBe(false);

    player.acceptQueue(queueOf(3, 200));
    const options = player.queueWindowOptions(100);
    expect(options.queryKey).toEqual(["queueWindow", 3, 100]);
    expect(options.enabled).toBe(true);
  });
});
