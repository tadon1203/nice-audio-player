import {
  type Appearance as AppearanceValue,
  type BackendMessage,
  type LibraryState,
  type PlaybackPosition,
  type QueueState,
  type PlayerState,
  type PlaybackWaveform,
  type Versioned,
} from "#lib/native/bindings";
import type { app } from "#lib/native/commands";
import { countE2e } from "./e2e-counts";

export type ConnectionState = "connecting" | "ready" | "failed";

/** Where `NativeSession` sends each value. Method types only, so tests pass small fakes. */
export interface SessionTargets {
  readonly playback: {
    acceptPlayback(incoming: Versioned<PlayerState>): void;
    acceptQueue(incoming: Versioned<QueueState>): void;
    acceptWaveform(incoming: Versioned<PlaybackWaveform | null>): void;
    acceptPosition(position: PlaybackPosition): void;
  };
  readonly appearance: { accept(incoming: Versioned<AppearanceValue>): void };
  readonly library: { accept(incoming: Versioned<LibraryState>): void };
  readonly notices: { noteSkipped(title: string | null): void };
}

/** The one place that runs the connect procedure. */
export class NativeSession {
  readonly #app: typeof app;
  readonly #targets: SessionTargets;
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
   * Starts the connection and routes every message. Returns the cleanup (for HMR and tests): a
   * message that arrives after it is dropped.
   */
  public connect(): () => void {
    let active = true;
    // A message that arrives before `connect` answers waits for it, so the initial state is never
    // applied over a newer message.
    let early: BackendMessage[] | null = [];
    const receive = (message: BackendMessage): void => {
      if (!active) return;
      if (message.kind === "state") countE2e("stateMessages");
      if (early === null) this.#route(message);
      else early.push(message);
    };

    const fail = (error: unknown): void => {
      early = null;
      if (!active) return;
      this.#startupError = error;
      this.#connection = "failed";
    };

    this.#connection = "connecting";
    this.#app.connect(receive).then((initial) => {
      if (!active) return;
      // A throw while the initial state is applied is a startup failure too, not a stuck connecting state.
      try {
        for (const message of initial) this.#route(message);
        for (const message of early ?? []) this.#route(message);
        early = null;
        this.#connection = "ready";
      } catch (error) {
        fail(error);
        return;
      }
      // Counted once the state is applied, so a count says the backend answered.
      countE2e("connects");
    }, fail);

    return () => {
      active = false;
    };
  }

  #route(message: BackendMessage): void {
    if (message.kind === "position") {
      this.#targets.playback.acceptPosition(message);
      return;
    }
    if (message.kind === "trackSkipped") {
      this.#targets.notices.noteSkipped(message.title);
      return;
    }
    switch (message.topic) {
      case "playback":
        this.#targets.playback.acceptPlayback({ version: message.version, value: message.value });
        return;
      case "queue":
        this.#targets.playback.acceptQueue({ version: message.version, value: message.value });
        return;
      case "library":
        this.#targets.library.accept({ version: message.version, value: message.value });
        return;
      case "waveform":
        this.#targets.playback.acceptWaveform({ version: message.version, value: message.value });
        return;
      case "appearance":
        this.#targets.appearance.accept({ version: message.version, value: message.value });
        return;
    }
  }
}
