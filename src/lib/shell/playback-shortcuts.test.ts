import { describe, expect, it, vi } from "vitest";
import type { PlaybackClient, PlaybackSnapshot, Versioned } from "#lib/native";
import { PlaybackClock } from "#lib/playback/playback-clock.svelte";
import { Playback } from "#lib/playback/playback.svelte";
import { NoticeCenter } from "./notice-center.svelte";
import { PlaybackShortcuts } from "./playback-shortcuts";
import { UserActionRunner } from "./user-action-runner.svelte";

const playing = (positionMs: number): Versioned<PlaybackSnapshot> => ({
  revision: 1,
  value: playingValue(positionMs),
});

const playingValue = (positionMs: number): PlaybackSnapshot => ({
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
      trackId: 1,
      title: "a",
      artist: null,
      album: null,
      albumArtist: null,
      artwork: null,
      durationMs: 60_000,
      trackNumber: null,
      discNumber: null,
      year: null,
    },
    startedBy: "jump",
    playbackId: 1,
    positionMs,
    seekRevision: 0,
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
    const seekPlayback = vi.fn(async (positionMs: number) => playing(positionMs));
    const playback = new Playback({ seek: seekPlayback } as unknown as PlaybackClient, clock);
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
    await vi.waitFor(() => expect(seekPlayback).toHaveBeenCalledTimes(1));

    const [sent] = seekPlayback.mock.calls[0]!;
    expect(Number.isInteger(sent)).toBe(true);
    expect(sent).toBeGreaterThan(10_000);
    expect(notices.at("dock")).toBeNull();
  });
});
