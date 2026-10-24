import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PlaybackState, type ScanState, type InitialState } from "#lib/native/bindings";
import { AppServices } from "./app-services.svelte";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("#lib/native/commands", () => ({
  app: { connect: mocks.connect },
  appearance: {},
  library: {},
  lyrics: {},
  player: {},
}));

const base = {
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
};

const stopped: PlaybackState = { status: "stopped", base, item: null };

const scan = { finishedCount: 0, changedCount: 0 } as ScanState;

const initial: InitialState = {
  playback: { revision: 1, value: stopped },
  queue: {
    revision: 1,
    value: {
      current: null,
      history: [],
      historyCount: 0,
      upcoming: [],
      upcomingCount: 0,
      repeatMode: "off",
      shuffleEnabled: false,
      canRestorePrevious: false,
    },
  },
  libraryScan: { revision: 1, value: scan },
  waveform: { revision: 1, value: null },
  appearance: { revision: 1, value: { artworkBackdrop: true, calmMotion: false } },
};

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.connect.mockResolvedValue(initial);
});

describe("AppServices", () => {
  it("builds the session, playback, appearance, and motion services from the area objects", () => {
    const services = new AppServices(new QueryClient());

    expect(services.session.connection).toBe("connecting");
    expect(services.playback).toBeDefined();
    expect(services.appearance.artworkBackdrop).toBeNull();
    expect(services.motion.current).toBeDefined();
    expect(services.queryClient).toBeInstanceOf(QueryClient);
  });

  it("connects the session, and the initial state reaches the services", async () => {
    const services = new AppServices(new QueryClient());

    services.session.connect();

    await vi.waitFor(() => expect(services.session.connection).toBe("ready"));
    expect(services.playback.snapshot).toEqual(stopped);
    expect(services.appearance.artworkBackdrop).toBe(true);
  });
});
