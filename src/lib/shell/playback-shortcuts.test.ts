import { describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, TNativeAPI } from "$lib/native";
import { createPlaybackClock } from "$lib/playback/clock";
import { createPlayback } from "$lib/playback/playback.svelte";
import { handlePlaybackShortcut } from "./playback-shortcuts";

const playing = (positionMs: number): PlaybackSnapshot => ({
  status: "playing",
  base: {
    revision: 1,
    volume: 0.5,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious: false,
    canGoNext: false,
  },
  session: {
    item: {
      queueItemId: "queue-a",
      trackId: "a",
      title: "a",
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
    },
    playbackId: "1",
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
    const clock = createPlaybackClock({
      now: () => now,
      requestFrame: () => 0,
      cancelFrame: () => undefined,
    });
    const seekPlayback = vi.fn(async (positionMs: number) => playing(positionMs));
    const playback = createPlayback({ seekPlayback } as unknown as TNativeAPI, clock);
    playback.acceptPlayback(playing(10_000));
    now = 1_000 + 250.37;
    expect(Number.isInteger(clock.estimate())).toBe(false);

    handlePlaybackShortcut(new KeyboardEvent("keydown", { key: "ArrowRight" }), playback);
    await vi.waitFor(() => expect(seekPlayback).toHaveBeenCalledTimes(1));

    const [sent] = seekPlayback.mock.calls[0]!;
    expect(Number.isInteger(sent)).toBe(true);
    expect(sent).toBeGreaterThan(10_000);
    expect(playback.error).toBeNull();
  });
});
