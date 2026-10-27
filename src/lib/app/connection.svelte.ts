import { type BackendMessage, type CommandError } from "#lib/native/bindings";
import type { app as appCommands } from "#lib/native/commands";
import { countE2e } from "./e2e-counts";
import type { App } from "./app.svelte";

export type ConnectionState = "connecting" | "ready" | "failed";

/** The state kinds the Backend sends on connect: the connection is ready once each has arrived. */
const STATE_KINDS = ["player", "queue", "library", "waveform", "appearance"] as const;

/** The one place that runs the connect procedure and routes every pushed message to its area. */
export class Connection {
  readonly #commands: typeof appCommands;
  readonly #app: App;
  readonly #arrived = new Set<string>();
  #state = $state.raw<ConnectionState>("connecting");
  #startupError = $state.raw<CommandError | null>(null);

  public constructor(commands: typeof appCommands, app: App) {
    this.#commands = commands;
    this.#app = app;
  }

  public get state(): ConnectionState {
    return this.#state;
  }

  /** Why the connection failed, while `state` is `failed`; the Renderer shows it. */
  public get startupError(): CommandError | null {
    return this.#startupError;
  }

  /**
   * Registers the channel and routes every message it carries. The Backend sends the latest value of
   * each state first, so the connection is ready once each state kind has arrived. Returns the
   * cleanup (for HMR and tests): a message that arrives after it is dropped.
   */
  public connect(): () => void {
    let active = true;

    const fail = (error: CommandError): void => {
      if (!active) return;
      this.#startupError = error;
      this.#state = "failed";
    };

    this.#state = "connecting";
    void this.#commands
      .connect((message) => {
        if (active) this.#route(message);
      })
      .then((outcome) => {
        if (!outcome.ok) fail(outcome.error);
      })
      // The adapter never rejects. A rejection is still a failed connect, so it shows as one.
      .catch(() => fail({ code: "internal" }));

    return () => {
      active = false;
    };
  }

  #route(message: BackendMessage): void {
    switch (message.kind) {
      case "player":
        this.#app.player.acceptPlayback(message.value);
        break;
      case "queue":
        this.#app.player.acceptQueue(message.value);
        break;
      case "library":
        this.#app.library.state.accept(message.value);
        break;
      case "waveform":
        this.#app.player.acceptWaveform(message.value);
        break;
      case "appearance":
        this.#app.appearance.accept(message.value);
        break;
      case "position":
        this.#app.player.acceptPosition(message.value);
        return;
      case "trackSkipped":
        this.#app.notices.noteSkipped(message.value.title);
        return;
    }
    this.#noteArrived(message.kind);
  }

  /** Counts a state message, and marks the connection ready once every state kind has arrived. */
  #noteArrived(kind: (typeof STATE_KINDS)[number]): void {
    countE2e("stateMessages");
    if (this.#state === "ready") return;
    this.#arrived.add(kind);
    if (STATE_KINDS.every((stateKind) => this.#arrived.has(stateKind))) {
      this.#state = "ready";
      // Counted once every state has arrived, so a count says the backend answered.
      countE2e("connects");
    }
  }
}
