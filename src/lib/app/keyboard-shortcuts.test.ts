import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import { type PlayerState } from "#lib/native/bindings";
import { App } from "./app.svelte";
import * as native from "#lib/native/commands";
import { Notices } from "./user-actions.svelte";
import { handleShortcut } from "./keyboard-shortcuts";

const mocks = vi.hoisted(() => ({ seek: vi.fn() }));
vi.mock("#lib/native/commands", () => ({
  app: {},
  appearance: {},
  library: {},
  lyrics: {},
  player: { seek: mocks.seek },
}));

const playing = (positionMs: number): PlayerState => ({
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
    outputDeviceName: "Speakers",
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
    mocks.seek.mockResolvedValue({ ok: true, value: null });
    const app = new App(native, new QueryClient(), new Notices());
    app.player.acceptState(playing(10_000));
    vi.spyOn(app.player.clock, "estimate").mockReturnValue(10_250.37);

    handleShortcut(new KeyboardEvent("keydown", { key: "ArrowRight" }), app);
    await vi.waitFor(() => expect(mocks.seek).toHaveBeenCalledTimes(1));

    const [sent] = mocks.seek.mock.calls[0]!;
    expect(Number.isInteger(sent)).toBe(true);
    expect(sent).toBeGreaterThan(10_000);
    expect(app.notices.at("dock")).toBeNull();
  });
});
