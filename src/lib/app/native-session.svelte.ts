import {
  type Appearance as AppearanceValue,
  type BackendMessage,
  type LibraryState,
  type PlaybackPosition,
  type PlaybackWaveform,
  type PlayerState,
  type QueueState,
} from "#lib/native/bindings";
import type { app } from "#lib/native/commands";
import { countE2e } from "./e2e-counts";

export type ConnectionState = "connecting" | "ready" | "failed";

/** The state kinds the Backend sends on connect: the connection is ready once each has arrived. */
const STATE_KINDS = ["player", "queue", "library", "waveform", "appearance"] as const;

/** Where `NativeSession` sends each message. Method types only, so tests pass small fakes. */
export interface SessionTargets {
  readonly playback: {
    acceptPlayback(state: PlayerState): void;
    acceptQueue(state: QueueState): void;
    acceptWaveform(waveform: PlaybackWaveform | null): void;
    acceptPosition(position: PlaybackPosition): void;
  };
  readonly appearance: { accept(state: AppearanceValue): void };
  readonly library: { accept(state: LibraryState): void };
  readonly notices: { noteSkipped(title: string | null): void };
}

/** The one place that runs the connect procedure. */
export class NativeSession {
  readonly #app: typeof app;
  readonly #targets: SessionTargets;
  readonly #arrived = new Set<string>();
  #connection = $state.raw<ConnectionState>("connecting");
  #startupError = $state.raw<unknown>(null);

  public constructor(appCommands: typeof app, targets: SessionTargets) {
    this.#app = appCommands;
    this.#targets = targets;
  }

  public get connection(): ConnectionState {
    return this.#connection;
  }

  /** Why the connection failed, while `connection` is `failed`; the Renderer shows it. */
  public get startupError(): unknown {
    return this.#startupError;
  }

  /**
   * Registers the channel and routes every message it carries. The Backend sends the latest value of
   * each state first, so the connection is ready once each state kind has arrived. Returns the
   * cleanup (for HMR and tests): a message that arrives after it is dropped.
   */
  public connect(): () => void {
    let active = true;

    const fail = (error: unknown): void => {
      if (!active) return;
      this.#startupError = error;
      this.#connection = "failed";
    };

    this.#connection = "connecting";
    this.#app
      .connect((message) => {
        if (active) this.#route(message);
      })
      .catch(fail);

    return () => {
      active = false;
    };
  }

  #route(message: BackendMessage): void {
    switch (message.kind) {
      case "player":
        this.#targets.playback.acceptPlayback(message.value);
        break;
      case "queue":
        this.#targets.playback.acceptQueue(message.value);
        break;
      case "library":
        this.#targets.library.accept(message.value);
        break;
      case "waveform":
        this.#targets.playback.acceptWaveform(message.value);
        break;
      case "appearance":
        this.#targets.appearance.accept(message.value);
        break;
      case "position":
        this.#targets.playback.acceptPosition(message.value);
        return;
      case "trackSkipped":
        this.#targets.notices.noteSkipped(message.value.title);
        return;
    }
    this.#noteArrived(message.kind);
  }

  /** Counts a state message, and marks the connection ready once every state kind has arrived. */
  #noteArrived(kind: (typeof STATE_KINDS)[number]): void {
    countE2e("stateMessages");
    if (this.#connection === "ready") return;
    this.#arrived.add(kind);
    if (STATE_KINDS.every((stateKind) => this.#arrived.has(stateKind))) {
      this.#connection = "ready";
      // Counted once every state has arrived, so a count says the backend answered.
      countE2e("connects");
    }
  }
}
