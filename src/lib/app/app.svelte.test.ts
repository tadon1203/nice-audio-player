import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BackendMessage, type LibraryState, type PlayerState } from "#lib/native/bindings";
import { App } from "./app.svelte";

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

const stopped: PlayerState = { status: "stopped", base, item: null };

const library = { status: { status: "ready" }, version: 0 } as LibraryState;

/** The latest value of each state kind, as the Backend sends them on connect. */
const initial: BackendMessage[] = [
  { kind: "player", value: stopped },
  {
    kind: "queue",
    value: {
      version: 1,
      current: null,
      history: [],
      upcoming: [],
      upcomingCount: 0,
      repeatMode: "off",
      shuffleEnabled: false,
    },
  },
  { kind: "library", value: library },
  { kind: "waveform", value: null },
  { kind: "appearance", value: { artworkBackdrop: true, calmMotion: false } },
];

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.connect.mockImplementation(async (onMessage: (message: BackendMessage) => void) => {
    for (const message of initial) onMessage(message);
    return { ok: true, value: undefined };
  });
});

describe("App", () => {
  it("builds the areas from the native area objects", () => {
    const app = new App(new QueryClient());

    expect(app.connection.state).toBe("connecting");
    expect(app.player).toBeDefined();
    expect(app.appearance.artworkBackdrop).toBeNull();
    expect(app.library.state.snapshot).toBeNull();
    expect(app.queuePanelOpen).toBe(false);
    expect(app.queryClient).toBeInstanceOf(QueryClient);
  });

  it("connects, and the initial state reaches the areas", async () => {
    const app = new App(new QueryClient());

    app.connection.connect();

    await vi.waitFor(() => expect(app.connection.state).toBe("ready"));
    expect(app.player.snapshot).toEqual(stopped);
    expect(app.appearance.artworkBackdrop).toBe(true);
  });
});
