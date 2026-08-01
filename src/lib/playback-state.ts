import type { PlaybackSnapshot } from "@/bindings";

export type PlaybackConnectionState = "initializing" | "ready" | "unavailable";

export interface PlaybackUiState {
  snapshot: PlaybackSnapshot;
  connection: PlaybackConnectionState;
  commandError: { lane: PlaybackCommandLane; message: string } | null;
  connectionError: string | null;
}

export type PlaybackUiAction =
  | { type: "snapshotReceived"; snapshot: PlaybackSnapshot }
  | { type: "connectionReady" }
  | { type: "connectionUnavailable"; message: string }
  | { type: "commandStarted"; lane: PlaybackCommandLane }
  | { type: "commandSucceeded"; lane: PlaybackCommandLane }
  | { type: "commandFailed"; lane: PlaybackCommandLane; message: string };

export type PlaybackCommandLane = "transport" | "seek" | "volume" | "output";

export const initialPlaybackSnapshot: PlaybackSnapshot = {
  status: "stopped",
  revision: 0,
  file: null,
  volume: 1,
  muted: false,
  outputSelection: { kind: "systemDefault" },
};

export const initialPlaybackUiState: PlaybackUiState = {
  snapshot: initialPlaybackSnapshot,
  connection: "initializing",
  commandError: null,
  connectionError: null,
};

export function playbackUiReducer(
  state: PlaybackUiState,
  action: PlaybackUiAction,
): PlaybackUiState {
  switch (action.type) {
    case "snapshotReceived":
      if (action.snapshot.revision <= state.snapshot.revision) return state;
      return { ...state, snapshot: action.snapshot };
    case "connectionReady":
      return { ...state, connection: "ready", connectionError: null };
    case "connectionUnavailable":
      return {
        ...state,
        connection: "unavailable",
        connectionError: action.message,
      };
    case "commandStarted":
      return state;
    case "commandSucceeded":
      return {
        ...state,
        commandError: state.commandError?.lane === action.lane ? null : state.commandError,
      };
    case "commandFailed":
      return { ...state, commandError: { lane: action.lane, message: action.message } };
  }
}

export type TransportIntent = "playing" | "paused" | "stopped";
export type TransportCommand = "start" | "stop" | "pause" | "resume";

export function commandForTransportIntent(
  intent: TransportIntent,
  snapshot: PlaybackSnapshot,
  hasReadyFile: boolean,
): TransportCommand | null {
  if (intent === "stopped") {
    return snapshot.status === "playing" || snapshot.status === "paused" ? "stop" : null;
  }
  if (intent === "paused") {
    return snapshot.status === "playing" ? "pause" : null;
  }
  if (snapshot.status === "paused") return "resume";
  if ((snapshot.status === "stopped" || snapshot.status === "failed") && hasReadyFile) {
    return "start";
  }
  return null;
}
