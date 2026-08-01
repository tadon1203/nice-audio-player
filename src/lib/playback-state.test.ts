import { describe, expect, it } from "vitest";

import type { PlaybackSnapshot } from "@/bindings";

import {
  commandForTransportIntent,
  initialPlaybackUiState,
  playbackUiReducer,
} from "./playback-state";

const file = { path: "C:/track.flac", fileName: "track.flac", extension: "flac" };

function stopped(revision: number): PlaybackSnapshot {
  return {
    status: "stopped",
    revision,
    file,
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
  };
}

function playing(revision: number): PlaybackSnapshot {
  return {
    status: "playing",
    revision,
    file,
    playbackId: "1",
    positionMs: 1_000,
    durationMs: 2_000,
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    outputDevice: { id: "default", name: "Speakers" },
  };
}

describe("playbackUiReducer", () => {
  it("rejects a stale command response after a newer event", () => {
    const afterEvent = playbackUiReducer(initialPlaybackUiState, {
      type: "snapshotReceived",
      snapshot: stopped(3),
    });
    const afterStaleResponse = playbackUiReducer(afterEvent, {
      type: "snapshotReceived",
      snapshot: playing(2),
    });

    expect(afterStaleResponse).toBe(afterEvent);
    expect(afterStaleResponse.snapshot).toEqual(stopped(3));
  });

  it("keeps connection and command errors separate from snapshots", () => {
    const failed = playbackUiReducer(initialPlaybackUiState, {
      type: "commandFailed",
      lane: "transport",
      message: "Command failed.",
    });
    const updated = playbackUiReducer(failed, {
      type: "snapshotReceived",
      snapshot: stopped(1),
    });

    expect(updated.commandError).toEqual({ lane: "transport", message: "Command failed." });
    expect(updated.snapshot.revision).toBe(1);

    const unrelatedStart = playbackUiReducer(updated, {
      type: "commandStarted",
      lane: "volume",
    });
    expect(unrelatedStart.commandError).toEqual({
      lane: "transport",
      message: "Command failed.",
    });
    expect(
      playbackUiReducer(unrelatedStart, { type: "commandSucceeded", lane: "transport" })
        .commandError,
    ).toBeNull();
  });
});

describe("commandForTransportIntent", () => {
  it("maps desired transport state from the authoritative snapshot", () => {
    expect(commandForTransportIntent("playing", stopped(1), true)).toBe("start");
    expect(commandForTransportIntent("paused", playing(2), true)).toBe("pause");
    expect(commandForTransportIntent("stopped", playing(2), true)).toBe("stop");
    expect(commandForTransportIntent("playing", playing(2), true)).toBeNull();
    expect(commandForTransportIntent("playing", stopped(1), false)).toBeNull();
  });
});
