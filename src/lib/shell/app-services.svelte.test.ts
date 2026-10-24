import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BackendMessage, type PlaybackState, type ScanState } from "#lib/native/bindings";
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

const initial: BackendMessage[] = [
  { kind: "state", version: 1, topic: "playback", value: stopped },
  {
    kind: "state",
    version: 1,
    topic: "queue",
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
  { kind: "state", version: 1, topic: "scan", value: scan },
  { kind: "state", version: 1, topic: "waveform", value: null },
  {
    kind: "state",
    version: 1,
    topic: "appearance",
    value: { artworkBackdrop: true, calmMotion: false },
  },
];

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
