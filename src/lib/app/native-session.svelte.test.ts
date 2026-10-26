import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { type BackendMessage, type PlaybackPosition } from "#lib/native/bindings";
import { app } from "#lib/native/commands";
import { NativeSession, type SessionTargets } from "./native-session.svelte";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ app: { connect: mocks.connect } }));

/** One `connect` call the test answers by hand: its message handler, and its reply. */
interface Attempt {
  onMessage: (message: BackendMessage) => void;
  answer: (initial: BackendMessage[]) => void;
  fail: (error: unknown) => void;
}

let attempts: Attempt[];

beforeEach(() => {
  attempts = [];
  mocks.connect.mockReset();
  mocks.connect.mockImplementation(
    (onMessage: (message: BackendMessage) => void) =>
      new Promise<BackendMessage[]>((answer, fail) => {
        attempts.push({ onMessage, answer, fail });
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
    scan: { accept: vi.fn() },
    notices: { noteSkipped },
  } as unknown as SessionTargets;
  return { targets, acceptPlayback, acceptPosition, noteSkipped };
}

const initial = (playbackVersion: number): BackendMessage[] => [
  { kind: "state", version: playbackVersion, topic: "playback", value: "snapshot" as never },
  { kind: "state", version: 1, topic: "queue", value: "queue" as never },
  { kind: "state", version: 1, topic: "scan", value: "scan" as never },
  { kind: "state", version: 1, topic: "waveform", value: null },
  {
    kind: "state",
    version: 1,
    topic: "appearance",
    value: { artworkBackdrop: true, calmMotion: false },
  },
];

const stateMessage = (version: number): BackendMessage => ({
  kind: "state",
  version,
  topic: "playback",
  value: "pushed" as never,
});

const position: PlaybackPosition = { playbackId: 1, positionMs: 250, seekCount: 0 };

describe("NativeSession", () => {
  it("is connecting until the initial state is applied, then ready", async () => {
    const session = new NativeSession(app, fakeTargets().targets);

    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].answer(initial(1));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
  });

  it("subscribes before it fetches, so a message sent in between is not lost", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    new NativeSession(app, targets).connect();

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    attempts[0].onMessage(stateMessage(2));
    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(acceptPlayback).toHaveBeenCalledTimes(2));
  });

  it("applies a message that arrives before the initial state after it, never before", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    new NativeSession(app, targets).connect();

    attempts[0].onMessage(stateMessage(5));
    expect(acceptPlayback).not.toHaveBeenCalled();

    attempts[0].answer(initial(4));
    await vi.waitFor(() => expect(acceptPlayback).toHaveBeenCalledTimes(2));

    const applied = acceptPlayback.mock.calls.map(([v]) => v.version);
    expect(applied).toEqual([4, 5]);
  });

  it("routes each message to the target of its topic", async () => {
    const { targets, acceptPosition, noteSkipped } = fakeTargets();
    const session = new NativeSession(app, targets);
    session.connect();
    attempts[0].answer(initial(1));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));

    attempts[0].onMessage({ kind: "position", ...position });
    attempts[0].onMessage({ kind: "trackSkipped", title: "Song" });

    expect(acceptPosition).toHaveBeenCalledWith({ kind: "position", ...position });
    expect(noteSkipped).toHaveBeenCalledWith("Song");
  });

  it("drops messages from a connection that was cleaned up", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    const cleanup = new NativeSession(app, targets).connect();

    cleanup();
    attempts[0].onMessage(stateMessage(2));

    expect(acceptPlayback).not.toHaveBeenCalled();
  });

  it("reconnects: a second connect replaces the first, which no longer applies anything", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(app, targets);

    const cleanup = session.connect();
    cleanup();
    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].onMessage(stateMessage(9));
    attempts[1].answer(initial(3));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
    attempts[1].onMessage(stateMessage(4));

    const applied = acceptPlayback.mock.calls.map(([v]) => v.version);
    expect(applied).toEqual([3, 4]);
  });

  it("is failed, and applies nothing, when the connect command fails", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(app, targets);
    session.connect();

    attempts[0].fail({ code: "output", failure: "noOutputDevice" });

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual({ code: "output", failure: "noOutputDevice" });
    expect(acceptPlayback).not.toHaveBeenCalled();
  });

  it("is failed, not stuck connecting, when applying the initial state throws", async () => {
    const { targets, acceptPlayback } = fakeTargets();
    acceptPlayback.mockImplementation(() => {
      throw new Error("bad state");
    });
    const session = new NativeSession(app, targets);
    session.connect();

    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual(new Error("bad state"));
  });
});
