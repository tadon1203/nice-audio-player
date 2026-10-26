import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { type BackendMessage, type PlaybackPosition } from "#lib/native/bindings";
import { app } from "#lib/native/commands";
import { NativeSession, type SessionTargets } from "./native-session.svelte";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ app: { connect: mocks.connect } }));

/** One `connect` call the test drives by hand: its message handler, and its reply. */
interface Attempt {
  onMessage: (message: BackendMessage) => void;
  resolve: () => void;
  reject: (error: unknown) => void;
}

let attempts: Attempt[];

beforeEach(() => {
  attempts = [];
  mocks.connect.mockReset();
  mocks.connect.mockImplementation(
    (onMessage: (message: BackendMessage) => void) =>
      new Promise<void>((resolve, reject) => {
        attempts.push({ onMessage, resolve, reject });
      }),
  );
});

function fakeTargets(): {
  targets: SessionTargets;
  acceptPlayback: Mock;
  acceptPosition: Mock;
  noteSkipped: Mock;
} {
  const acceptPlayback = vi.fn();
  const acceptPosition = vi.fn();
  const noteSkipped = vi.fn();
  const targets = {
    playback: {
      acceptPlayback,
      acceptQueue: vi.fn(),
      acceptWaveform: vi.fn(),
      acceptPosition,
    },
    appearance: { accept: vi.fn() },
    library: { accept: vi.fn() },
    notices: { noteSkipped },
  } as unknown as SessionTargets;
  return { targets, acceptPlayback, acceptPosition, noteSkipped };
}

/** The latest value of each state kind, as the Backend sends it on connect. */
const latestStates = (): BackendMessage[] => [
  { kind: "player", value: "playback" as never },
  { kind: "queue", value: "queue" as never },
  { kind: "library", value: "library" as never },
  { kind: "waveform", value: null },
  { kind: "appearance", value: { artworkBackdrop: true, calmMotion: false } },
];

const position: PlaybackPosition = { playbackId: 1, positionMs: 250, seekCount: 0 };

describe("NativeSession", () => {
  it("is connecting until each state kind has arrived, then ready", () => {
    const session = new NativeSession(app, fakeTargets().targets);
    session.connect();
    expect(session.connection).toBe("connecting");

    const [player, ...rest] = latestStates();
    attempts[0].onMessage(player);
    attempts[0].onMessage(rest[0]);
    attempts[0].onMessage(rest[1]);
    attempts[0].onMessage(rest[2]);
    expect(session.connection).toBe("connecting");

    attempts[0].onMessage(rest[3]);
    expect(session.connection).toBe("ready");
  });

  it("routes each message to the target of its kind", () => {
    const { targets, acceptPlayback, acceptPosition, noteSkipped } = fakeTargets();
    new NativeSession(app, targets).connect();

    attempts[0].onMessage({ kind: "player", value: "playback" as never });
    attempts[0].onMessage({ kind: "position", value: position });
    attempts[0].onMessage({ kind: "trackSkipped", value: { title: "Song" } });

    expect(acceptPlayback).toHaveBeenCalledWith("playback");
    expect(acceptPosition).toHaveBeenCalledWith(position);
    expect(noteSkipped).toHaveBeenCalledWith("Song");
  });

  it("applies the pushed states in the order they arrive", () => {
    const { targets, acceptPlayback } = fakeTargets();
    new NativeSession(app, targets).connect();

    attempts[0].onMessage({ kind: "player", value: "first" as never });
    attempts[0].onMessage({ kind: "player", value: "second" as never });

    expect(acceptPlayback.mock.calls.map(([state]) => state)).toEqual(["first", "second"]);
  });

  it("drops messages from a connection that was cleaned up", () => {
    const { targets, acceptPlayback } = fakeTargets();
    const cleanup = new NativeSession(app, targets).connect();

    cleanup();
    attempts[0].onMessage({ kind: "player", value: "playback" as never });

    expect(acceptPlayback).not.toHaveBeenCalled();
  });

  it("reconnects: a second connect replaces the first, which no longer delivers anything", () => {
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(app, targets);

    const cleanup = session.connect();
    cleanup();
    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].onMessage({ kind: "player", value: "stale" as never });
    for (const message of latestStates()) attempts[1].onMessage(message);
    attempts[1].onMessage({ kind: "player", value: "fresh" as never });

    expect(session.connection).toBe("ready");
    expect(acceptPlayback.mock.calls.map(([state]) => state)).toEqual(["playback", "fresh"]);
  });

  it("is failed, and applies nothing, when the connect command fails", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(app, targets);
    session.connect();

    attempts[0].reject({ code: "internal" });

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual({ code: "internal" });
    expect(acceptPlayback).not.toHaveBeenCalled();
  });
});
