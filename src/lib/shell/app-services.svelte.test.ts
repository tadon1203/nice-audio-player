import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import {
  type BackendMessage,
  type InitialState,
  type ScanState,
  type PlaybackState,
} from "#lib/native/bindings";
import { type NativeClients, type SessionClient } from "#lib/native/native-clients";
import { AppServices } from "./app-services.svelte";

const base = {
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
};

const stopped: PlaybackState = { status: "stopped", base, item: null };

const scan = { finishedCount: 0, changedCount: 0 } as ScanState;

/** Fake clients: every command rejects unless a test gives the method it calls. */
function fakeNative(session: Partial<SessionClient> = {}): NativeClients {
  return {
    session: {
      connect: vi.fn(async (_onMessage: (message: BackendMessage) => void) => initial),
      ...session,
    },
    playback: {},
    appearance: { update: vi.fn() },
  } as unknown as NativeClients;
}

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

describe("AppServices", () => {
  it("builds the session, playback, appearance, and motion services from the native clients", () => {
    const services = new AppServices(fakeNative(), new QueryClient());

    expect(services.session.connection).toBe("connecting");
    expect(services.playback).toBeDefined();
    expect(services.appearance.artworkBackdrop).toBeNull();
    expect(services.motion.current).toBeDefined();
    expect(services.queryClient).toBeInstanceOf(QueryClient);
  });

  it("connects the session, and the initial state reaches the services", async () => {
    const native = fakeNative();
    const services = new AppServices(native, new QueryClient());

    services.session.connect();

    await vi.waitFor(() => expect(services.session.connection).toBe("ready"));
    expect(services.playback.snapshot).toEqual(stopped);
    expect(services.appearance.artworkBackdrop).toBe(true);
  });
});
