import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BackendMessage, type PlayerState, type QueueState } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import { App } from "./app.svelte";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("#lib/native/commands", () => ({
  app: { connect: mocks.connect },
  appearance: {},
  library: {},
  lyrics: {},
  player: {},
}));

/** One `connect` call the test drives by hand: its message handler, and its reply. */
interface Attempt {
  onMessage: (message: BackendMessage) => void;
  resolve: (outcome: Result<void>) => void;
}

let attempts: Attempt[];

beforeEach(() => {
  attempts = [];
  mocks.connect.mockReset();
  mocks.connect.mockImplementation(
    (onMessage: (message: BackendMessage) => void) =>
      new Promise<Result<void>>((resolve) => {
        attempts.push({ onMessage, resolve });
      }),
  );
});

const base = {
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" as const },
  canGoPrevious: false,
  canGoNext: false,
};

const stopped: PlayerState = { status: "stopped", base, item: null };

const queue: QueueState = {
  version: 1,
  current: null,
  history: [],
  upcoming: [],
  upcomingCount: 0,
  repeatMode: "off",
  shuffleEnabled: false,
};

/** The latest value of each state kind, as the Backend sends it on connect. */
const latestStates = (): BackendMessage[] => [
  { kind: "player", value: stopped },
  { kind: "queue", value: queue },
  { kind: "library", value: { status: { status: "ready" }, version: 0 } as never },
  { kind: "waveform", value: null },
  { kind: "appearance", value: { artworkBackdrop: true, calmMotion: false } },
];

describe("Connection", () => {
  it("is connecting until each state kind has arrived, then ready", () => {
    const app = new App(new QueryClient());
    app.connection.connect();
    expect(app.connection.state).toBe("connecting");

    const [player, ...rest] = latestStates();
    attempts[0].onMessage(player);
    attempts[0].onMessage(rest[0]);
    attempts[0].onMessage(rest[1]);
    attempts[0].onMessage(rest[2]);
    expect(app.connection.state).toBe("connecting");

    attempts[0].onMessage(rest[3]);
    expect(app.connection.state).toBe("ready");
  });

  it("routes each state message to its area", () => {
    const app = new App(new QueryClient());
    app.connection.connect();

    for (const message of latestStates()) attempts[0].onMessage(message);

    expect(app.player.snapshot).toEqual(stopped);
    expect(app.appearance.artworkBackdrop).toBe(true);
    expect(app.library.state.snapshot).not.toBeNull();
  });

  it("routes a skipped track to the Notices", () => {
    const app = new App(new QueryClient());
    app.connection.connect();

    attempts[0].onMessage({ kind: "trackSkipped", value: { title: "Song" } });

    expect(app.notices.at("dock")).toEqual({
      kind: "skipped",
      message: "Couldn't play Song, skipped",
    });
  });

  it("applies the pushed states in the order they arrive", () => {
    const app = new App(new QueryClient());
    app.connection.connect();
    const second: PlayerState = { ...stopped, base: { ...base, volume: 0.5 } };

    attempts[0].onMessage({ kind: "player", value: stopped });
    attempts[0].onMessage({ kind: "player", value: second });

    expect(app.player.snapshot).toEqual(second);
  });

  it("drops messages from a connection that was cleaned up", () => {
    const app = new App(new QueryClient());
    const cleanup = app.connection.connect();

    cleanup();
    attempts[0].onMessage({ kind: "player", value: stopped });

    expect(app.player.snapshot).toBeNull();
  });

  it("reconnects: a second connect replaces the first, which no longer delivers anything", () => {
    const app = new App(new QueryClient());

    const cleanup = app.connection.connect();
    cleanup();
    app.connection.connect();
    expect(app.connection.state).toBe("connecting");

    attempts[0].onMessage({ kind: "trackSkipped", value: { title: "Stale" } });
    for (const message of latestStates()) attempts[1].onMessage(message);

    expect(app.connection.state).toBe("ready");
    expect(app.notices.at("dock")).toBeNull();
  });

  it("is failed, and applies nothing, when the connect command fails", async () => {
    const app = new App(new QueryClient());
    app.connection.connect();

    attempts[0].resolve({ ok: false, error: { code: "internal" } });

    await vi.waitFor(() => expect(app.connection.state).toBe("failed"));
    expect(app.connection.startupError).toEqual({ code: "internal" });
    expect(app.player.snapshot).toBeNull();
  });
});
