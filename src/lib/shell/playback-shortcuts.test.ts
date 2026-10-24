import { describe, expect, it, vi } from "vitest";
import { player } from "#lib/native/commands";
import { type PlaybackState, type Versioned } from "#lib/native/bindings";
import { PlaybackClock } from "#lib/playback/playback-clock.svelte";
import { Playback } from "#lib/playback/playback.svelte";
import { NoticeCenter } from "./notice-center.svelte";
import { PlaybackShortcuts } from "./playback-shortcuts";
import { UserActionRunner } from "./user-action-runner.svelte";

const mocks = vi.hoisted(() => ({ seek: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ player: { seek: mocks.seek } }));

const playing = (positionMs: number): Versioned<PlaybackState> => ({
  version: 1,
  value: playingValue(positionMs),
});

const playingValue = (positionMs: number): PlaybackState => ({
  status: "playing",
  base: {
    volume: 0.5,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious: false,
    canGoNext: false,
  },
  session: {
    item: {
      queueItemId: 1,
      id: 1,
      title: "a",
      artist: null,
      album: null,
      artwork: null,
      durationMs: 60_000,
      trackNumber: null,
      discNumber: null,
      year: null,
    },
    startedBy: "jump",
    playbackId: 1,
    positionMs,
    seekCount: 0,
    durationMs: 60_000,
    outputDevice: { id: "speakers", name: "Speakers" },
    channelConversion: "none",
    sourceFormat: "MP3",
    sourceBitDepth: null,
    sourceBitrateKbps: null,
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  },
});

describe("global seek shortcut", () => {
  it("sends whole milliseconds even though the running clock is fractional", async () => {
    let now = 1_000;
    const clock = new PlaybackClock({
      now: (): number => now,
      requestFrame: (): number => 0,
      cancelFrame: (): undefined => undefined,
    });
    mocks.seek.mockImplementation(async (positionMs: number) => playing(positionMs));
    const playback = new Playback(player, clock);
    playback.acceptPlayback(playing(10_000));
    now = 1_000 + 250.37;
    expect(Number.isInteger(clock.estimate())).toBe(false);

    const notices = new NoticeCenter();
    PlaybackShortcuts.handle(
      new KeyboardEvent("keydown", { key: "ArrowRight" }),
      playback,
      new UserActionRunner(notices),
      {
        nowPlaying: { isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() },
        queuePanel: { isOpen: false, toggle: vi.fn() },
      },
    );
    await vi.waitFor(() => expect(mocks.seek).toHaveBeenCalledTimes(1));

    const [sent] = mocks.seek.mock.calls[0]!;
    expect(Number.isInteger(sent)).toBe(true);
    expect(sent).toBeGreaterThan(10_000);
    expect(notices.at("dock")).toBeNull();
  });
});
