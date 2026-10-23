import type {
  Appearance as AppearanceValue,
  BackendMessage,
  InitialState,
  ScanState,
  PlaybackPosition,
  QueueState,
  PlaybackState,
  PlaybackWaveform,
  SessionClient,
  Revisioned,
} from "#lib/native";
import { countE2e } from "./e2e-counts";

export type ConnectionState = "connecting" | "ready" | "failed";

/** Where `NativeSession` sends each value. Method types only, so tests pass small fakes. */
export interface SessionTargets {
  readonly playback: {
    acceptPlayback(incoming: Revisioned<PlaybackState>): void;
    acceptQueue(incoming: Revisioned<QueueState>): void;
    acceptWaveform(incoming: Revisioned<PlaybackWaveform | null>): void;
    acceptPosition(position: PlaybackPosition): void;
  };
  readonly appearance: { accept(incoming: Revisioned<AppearanceValue>): void };
  readonly scan: { accept(incoming: Revisioned<ScanState>): void };
  readonly notices: { noteSkipped(title: string | null): void };
}

/** The one place that runs the connect procedure. */
export class NativeSession {
  readonly #client: SessionClient;
  readonly #targets: SessionTargets;
  #connection = $state.raw<ConnectionState>("connecting");
  #startupError = $state.raw<unknown>(null);

  public constructor(client: SessionClient, targets: SessionTargets) {
    this.#client = client;
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
    this.#client.connect(receive).then((initial) => {
      if (!active) return;
      // A throw while the initial state is applied is a startup failure too, not a stuck connecting state.
      try {
        this.#applyInitial(initial);
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

  #applyInitial(initial: InitialState): void {
    this.#targets.playback.acceptPlayback(initial.playback);
    this.#targets.playback.acceptQueue(initial.queue);
    this.#targets.scan.accept(initial.libraryScan);
    this.#targets.playback.acceptWaveform(initial.waveform);
    this.#targets.appearance.accept(initial.appearance);
  }

  #route(message: BackendMessage): void {
    if (message.kind === "position") {
      this.#targets.playback.acceptPosition(message);
      return;
    }
    if (message.kind === "occurrence") {
      if (message.type === "trackSkipped")
        this.#targets.notices.noteSkipped(message.item?.title ?? null);
      return;
    }
    switch (message.topic) {
      case "playback":
        this.#targets.playback.acceptPlayback({ revision: message.revision, value: message.value });
        return;
      case "queue":
        this.#targets.playback.acceptQueue({ revision: message.revision, value: message.value });
        return;
      case "libraryScan":
        this.#targets.scan.accept({ revision: message.revision, value: message.value });
        return;
      case "waveform":
        this.#targets.playback.acceptWaveform({ revision: message.revision, value: message.value });
        return;
      case "appearance":
        this.#targets.appearance.accept({ revision: message.revision, value: message.value });
        return;
    }
  }
}
