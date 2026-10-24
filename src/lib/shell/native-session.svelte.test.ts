import { describe, expect, it, vi, type Mock } from "vitest";
import {
  type BackendMessage,
  type InitialState,
  type PlaybackPosition,
  type Revisioned,
} from "#lib/native/bindings";
import { type SessionClient } from "#lib/native/native-clients";
import { NativeSession, type SessionTargets } from "./native-session.svelte";

/** One `connect` call the test answers by hand: its message handler, and its reply. */
interface Attempt {
  onMessage: (message: BackendMessage) => void;
  answer: (initial: InitialState) => void;
  fail: (error: unknown) => void;
}

function fakeSession(): { client: SessionClient; connect: Mock; attempts: Attempt[] } {
  const attempts: Attempt[] = [];
  const connect = vi.fn(
    (onMessage: (message: BackendMessage) => void) =>
      new Promise<InitialState>((answer, fail) => {
        attempts.push({ onMessage, answer, fail });
      }),
  );
  const client: SessionClient = { connect };
  return { client, connect, attempts };
}

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

const playbackOf = (revision: number): Revisioned<never> => ({
  revision,
  value: "snapshot" as never,
});

const initial = (playbackRevision: number): InitialState =>
  ({
    playback: playbackOf(playbackRevision),
    queue: { revision: 1, value: "queue" as never },
    libraryScan: { revision: 1, value: "scan" as never },
    waveform: { revision: 1, value: null },
    appearance: { revision: 1, value: { artworkBackdrop: true, calmMotion: false } },
  }) as InitialState;

const stateMessage = (revision: number): BackendMessage => ({
  kind: "state",
  revision,
  topic: "playback",
  value: "pushed" as never,
});

const position: PlaybackPosition = { playbackId: 1, positionMs: 250, seekRevision: 0 };

describe("NativeSession", () => {
  it("is connecting until the initial state is applied, then ready", async () => {
    const { client, attempts } = fakeSession();
    const session = new NativeSession(client, fakeTargets().targets);

    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].answer(initial(1));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
  });

  it("subscribes before it fetches, so a message sent in between is not lost", async () => {
    const { client, connect, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    new NativeSession(client, targets).connect();

    expect(connect).toHaveBeenCalledTimes(1);
    attempts[0].onMessage(stateMessage(2));
    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(acceptPlayback).toHaveBeenCalledTimes(2));
  });

  it("applies a message that arrives before the initial state after it, never before", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    new NativeSession(client, targets).connect();

    attempts[0].onMessage(stateMessage(5));
    expect(acceptPlayback).not.toHaveBeenCalled();

    attempts[0].answer(initial(4));
    await vi.waitFor(() => expect(acceptPlayback).toHaveBeenCalledTimes(2));

    const applied = acceptPlayback.mock.calls.map(([v]) => v.revision);
    expect(applied).toEqual([4, 5]);
  });

  it("routes each message to the target of its topic", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPosition, noteSkipped } = fakeTargets();
    const session = new NativeSession(client, targets);
    session.connect();
    attempts[0].answer(initial(1));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));

    attempts[0].onMessage({ kind: "position", ...position });
    attempts[0].onMessage({
      kind: "occurrence",
      type: "trackSkipped",
      item: null,
      error: "decodeFailed",
    });

    expect(acceptPosition).toHaveBeenCalledWith({ kind: "position", ...position });
    expect(noteSkipped).toHaveBeenCalledWith(null);
  });

  it("drops messages from a connection that was cleaned up", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    const cleanup = new NativeSession(client, targets).connect();

    cleanup();
    attempts[0].onMessage(stateMessage(2));

    expect(acceptPlayback).not.toHaveBeenCalled();
  });

  it("reconnects: a second connect replaces the first, which no longer applies anything", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(client, targets);

    const cleanup = session.connect();
    cleanup();
    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].onMessage(stateMessage(9));
    attempts[1].answer(initial(3));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
    attempts[1].onMessage(stateMessage(4));

    const applied = acceptPlayback.mock.calls.map(([v]) => v.revision);
    expect(applied).toEqual([3, 4]);
  });

  it("is failed, and applies nothing, when the connect command fails", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    const session = new NativeSession(client, targets);
    session.connect();

    attempts[0].fail({ code: "noOutputDevice" });

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual({ code: "noOutputDevice" });
    expect(acceptPlayback).not.toHaveBeenCalled();
  });

  it("is failed, not stuck connecting, when applying the initial state throws", async () => {
    const { client, attempts } = fakeSession();
    const { targets, acceptPlayback } = fakeTargets();
    acceptPlayback.mockImplementation(() => {
      throw new Error("bad state");
    });
    const session = new NativeSession(client, targets);
    session.connect();

    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual(new Error("bad state"));
  });
});
