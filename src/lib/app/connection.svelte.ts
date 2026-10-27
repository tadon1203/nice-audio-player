import { type BackendMessage, type CommandError } from "#lib/native/bindings";
import type { app as appCommands } from "#lib/native/commands";
import type { Appearance } from "#lib/appearance/appearance.svelte";
import type { Library } from "#lib/library/library.svelte";
import type { Lyrics } from "#lib/lyrics/lyrics.svelte";
import type { Player } from "#lib/player/player.svelte";
import { countE2e } from "./e2e-counts";
import type { Notices } from "./user-actions.svelte";

export type ConnectionState = "connecting" | "ready" | "failed";

/** The state kinds the Backend sends on connect: the connection is ready once each has arrived. */
const STATE_KINDS = ["player", "queue", "library", "waveform", "appearance"] as const;

/** The Areas that the pushed messages go to. */
export interface ConnectionAreas {
  readonly player: Player;
  readonly library: Library;
  readonly lyrics: Lyrics;
  readonly appearance: Appearance;
  readonly notices: Notices;
}

/** The one place that runs the connect procedure and routes every pushed message to its area. */
export class Connection {
  readonly #commands: typeof appCommands;
  readonly #areas: ConnectionAreas;
  readonly #arrived = new Set<string>();
  #state = $state.raw<ConnectionState>("connecting");
  #startupError = $state.raw<CommandError | null>(null);

  public constructor(commands: typeof appCommands, areas: ConnectionAreas) {
    this.#commands = commands;
    this.#areas = areas;
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
   * each state first, so the connection is ready once each state kind has arrived.
   */
  public async connect(): Promise<void> {
    const fail = (error: CommandError): void => {
      this.#startupError = error;
      this.#state = "failed";
    };

    this.#state = "connecting";
    this.#arrived.clear();
    try {
      const outcome = await this.#commands.connect((message) => this.#route(message));
      if (!outcome.ok) fail(outcome.error);
    } catch {
      // The adapter never rejects. A rejection is still a failed connect, so it shows as one.
      fail({ code: "internal" });
    }
  }

  #route(message: BackendMessage): void {
    switch (message.kind) {
      case "player":
        this.#areas.player.acceptState(message.value);
        break;
      case "queue":
        this.#areas.player.acceptQueue(message.value);
        break;
      case "library":
        // A moved Library version means the lists may have changed, so the lyrics refresh too.
        if (this.#areas.library.accept(message.value)) this.#areas.lyrics.refresh();
        break;
      case "waveform":
        this.#areas.player.acceptWaveform(message.value);
        break;
      case "appearance":
        this.#areas.appearance.accept(message.value);
        break;
      case "position":
        this.#areas.player.acceptPosition(message.value);
        return;
      case "trackSkipped":
        this.#areas.notices.noteSkipped(message.value.title);
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
