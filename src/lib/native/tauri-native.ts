import { Channel, isTauri } from "@tauri-apps/api/core";
import {
  commands,
  type AudioDeviceListError,
  type BackendMessage,
  type PlaybackContext,
  type PlaybackServiceError,
} from "./bindings";
import { AppearanceError } from "./errors/appearance-error";
import { AudioDevicesError } from "./errors/audio-devices-error";
import { IpcError } from "./errors/ipc-error";
import { NativeBridgeUnavailableError } from "./errors/native-bridge-unavailable-error";
import { PlaybackError } from "./errors/playback-error";
import { SessionError } from "./errors/session-error";
import { SupersededError } from "./errors/superseded-error";
import type {
  AppearanceClient,
  NativeClients,
  PlaybackClient,
  SessionClient,
} from "./native-clients";

type Commands = typeof commands;

/** The `{ code }` a command rejected with, or null when the reply has none. */
function replyOf<TError extends { readonly code: string }>(reply: unknown): TError | null {
  if (typeof reply !== "object" || reply === null || !("code" in reply)) return null;
  return typeof reply.code === "string" ? (reply as TError) : null;
}

/** Runs one command. A coded reply becomes the domain's error; any other failure is IpcError. */
async function callCommand<T, TError extends { readonly code: string }>(
  run: () => Promise<T>,
  toError: (error: TError) => Error,
): Promise<T> {
  try {
    return await run();
  } catch (reply) {
    const error = replyOf<TError>(reply);
    if (error === null) throw new IpcError();
    throw toError(error);
  }
}

class TauriSessionClient implements SessionClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  connect(onMessage: (message: BackendMessage) => void) {
    return this.#call(() => this.#commands.connect(new Channel<BackendMessage>(onMessage)));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: { readonly code: string }) => new SessionError(error));
  }
}

class TauriPlaybackClient implements PlaybackClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  start(context: PlaybackContext, startTrackId: string | null) {
    return this.#call(() => this.#commands.startPlayback(context, startTrackId));
  }
  pause() {
    return this.#call(() => this.#commands.pausePlayback());
  }
  resume() {
    return this.#call(() => this.#commands.resumePlayback());
  }
  previous() {
    return this.#call(() => this.#commands.previousPlayback());
  }
  next() {
    return this.#call(() => this.#commands.nextPlayback());
  }
  seek(positionMs: number) {
    return this.#call(() => this.#commands.seekPlayback(positionMs));
  }
  setVolume(volume: number) {
    return this.#call(() => this.#commands.setPlaybackVolume(volume));
  }
  setMuted(muted: boolean) {
    return this.#call(() => this.#commands.setPlaybackMuted(muted));
  }
  setOutputSelection(selection: Parameters<Commands["setAudioOutputSelection"]>[0]) {
    return this.#call(() => this.#commands.setAudioOutputSelection(selection));
  }
  setRepeatMode(mode: Parameters<Commands["setPlaybackRepeatMode"]>[0]) {
    return this.#call(() => this.#commands.setPlaybackRepeatMode(mode));
  }
  setShuffle(enabled: boolean) {
    return this.#call(() => this.#commands.setPlaybackShuffle(enabled));
  }
  removeQueueItem(id: string) {
    return this.#call(() => this.#commands.removeQueueItem(id));
  }
  moveQueueItem(id: string, to: number) {
    return this.#call(() => this.#commands.moveQueueItem(id, to));
  }
  playQueueItem(id: string) {
    return this.#call(() => this.#commands.playQueueItem(id));
  }
  enqueueTrack(trackId: string, next: boolean) {
    return this.#call(() => this.#commands.enqueueTrack(trackId, next));
  }
  clearQueue() {
    return this.#call(() => this.#commands.clearQueue());
  }
  restorePreviousQueue() {
    return this.#call(() => this.#commands.restorePreviousQueue());
  }
  queueWindow(offset: number, limit: number) {
    return this.#call(() => this.#commands.getPlaybackQueueWindow(offset, limit));
  }
  waveform() {
    return this.#call(() => this.#commands.getPlaybackWaveform());
  }
  listOutputDevices() {
    return callCommand(
      () => this.#commands.listAudioOutputDevices(),
      (error: AudioDeviceListError) => new AudioDevicesError(error),
    );
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: PlaybackServiceError) =>
      error.code === "superseded" ? new SupersededError(error) : new PlaybackError(error),
    );
  }
}

class TauriAppearanceClient implements AppearanceClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  update(patch: Parameters<Commands["updateAppearance"]>[0]) {
    return this.#call(() => this.#commands.updateAppearance(patch));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: { readonly code: string }) => new AppearanceError(error));
  }
}

/** The Tauri adapter: the only Renderer code that imports `@tauri-apps/*` for the native clients. */
export class TauriNative {
  /**
   * The Tauri clients. Throws NativeBridgeUnavailableError outside the desktop app. Tests pass
   * `source`, a fake command set, and then the desktop check is skipped.
   */
  public static clients(source?: Commands): NativeClients {
    if (source === undefined && (typeof window === "undefined" || !isTauri())) {
      throw new NativeBridgeUnavailableError();
    }
    const commandSet = source ?? commands;
    return {
      session: new TauriSessionClient(commandSet),
      playback: new TauriPlaybackClient(commandSet),
      appearance: new TauriAppearanceClient(commandSet),
    };
  }
}
