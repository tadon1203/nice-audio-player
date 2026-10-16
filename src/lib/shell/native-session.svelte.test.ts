import { describe, expect, it, vi } from "vitest";
import type {
  BackendMessage,
  InitialState,
  PlaybackPosition,
  SessionClient,
  Versioned,
} from "#lib/native";
import { NativeSession, type SessionTargets } from "./native-session.svelte";

/** One `connect` call the test answers by hand: its message handler, and its reply. */
type Attempt = {
  onMessage: (message: BackendMessage) => void;
  answer: (initial: InitialState) => void;
  fail: (error: unknown) => void;
};

function fakeSession() {
  const attempts: Attempt[] = [];
  const client: SessionClient = {
    connect: vi.fn(
      (onMessage: (message: BackendMessage) => void) =>
        new Promise<InitialState>((answer, fail) => {
          attempts.push({ onMessage, answer, fail });
        }),
    ),
  };
  return { client, attempts };
}

function fakeTargets(): SessionTargets {
  return {
    playback: {
      acceptPlayback: vi.fn(),
      acceptQueue: vi.fn(),
      acceptPosition: vi.fn(),
    },
    appearance: { accept: vi.fn() },
    scan: { accept: vi.fn() },
    waveforms: { accept: vi.fn() },
    notices: { noteSkipped: vi.fn() },
  } as unknown as SessionTargets;
}

const playbackOf = (revision: number): Versioned<never> => ({
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

const position: PlaybackPosition = { playbackId: "1", positionMs: 250, seekRevision: 0 };

describe("NativeSession", () => {
  it("is connecting until the initial state is applied, then ready", async () => {
    const { client, attempts } = fakeSession();
    const session = new NativeSession(client, fakeTargets());

    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].answer(initial(1));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
  });

  it("subscribes before it fetches, so a message sent in between is not lost", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    new NativeSession(client, targets).connect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    attempts[0].onMessage(stateMessage(2));
    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(targets.playback.acceptPlayback).toHaveBeenCalledTimes(2));
  });

  it("applies a message that arrives before the initial state after it, never before", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    new NativeSession(client, targets).connect();

    attempts[0].onMessage(stateMessage(5));
    expect(targets.playback.acceptPlayback).not.toHaveBeenCalled();

    attempts[0].answer(initial(4));
    await vi.waitFor(() => expect(targets.playback.acceptPlayback).toHaveBeenCalledTimes(2));

    const applied = vi.mocked(targets.playback.acceptPlayback).mock.calls.map(([v]) => v.revision);
    expect(applied).toEqual([4, 5]);
  });

  it("routes each message to the target of its topic", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
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

    expect(targets.playback.acceptPosition).toHaveBeenCalledWith({ kind: "position", ...position });
    expect(targets.notices.noteSkipped).toHaveBeenCalledWith(null);
  });

  it("drops messages from a connection that was cleaned up", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    const cleanup = new NativeSession(client, targets).connect();

    cleanup();
    attempts[0].onMessage(stateMessage(2));

    expect(targets.playback.acceptPlayback).not.toHaveBeenCalled();
  });

  it("reconnects: a second connect replaces the first, which no longer applies anything", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    const session = new NativeSession(client, targets);

    const cleanup = session.connect();
    cleanup();
    session.connect();
    expect(session.connection).toBe("connecting");

    attempts[0].onMessage(stateMessage(9));
    attempts[1].answer(initial(3));
    await vi.waitFor(() => expect(session.connection).toBe("ready"));
    attempts[1].onMessage(stateMessage(4));

    const applied = vi.mocked(targets.playback.acceptPlayback).mock.calls.map(([v]) => v.revision);
    expect(applied).toEqual([3, 4]);
  });

  it("is failed, and applies nothing, when the connect command fails", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    const session = new NativeSession(client, targets);
    session.connect();

    attempts[0].fail({ code: "noOutputDevice" });

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual({ code: "noOutputDevice" });
    expect(targets.playback.acceptPlayback).not.toHaveBeenCalled();
  });

  it("is failed, not stuck connecting, when applying the initial state throws", async () => {
    const { client, attempts } = fakeSession();
    const targets = fakeTargets();
    vi.mocked(targets.playback.acceptPlayback).mockImplementation(() => {
      throw new Error("bad state");
    });
    const session = new NativeSession(client, targets);
    session.connect();

    attempts[0].answer(initial(1));

    await vi.waitFor(() => expect(session.connection).toBe("failed"));
    expect(session.startupError).toEqual(new Error("bad state"));
  });
});
