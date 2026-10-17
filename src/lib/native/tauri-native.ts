import { Channel, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  commands,
  type ArtworkHash,
  type AudioDeviceListError,
  type BackendMessage,
  type LibraryCommandError,
  type LyricsCommandError,
  type PlaybackContext,
  type PlaybackServiceError,
  type QueueItemId,
  type TrackId,
} from "./bindings";
import { AppearanceError } from "./errors/appearance-error";
import { AudioDevicesError } from "./errors/audio-devices-error";
import { IpcError } from "./errors/ipc-error";
import { LibraryError } from "./errors/library-error";
import { LyricsError } from "./errors/lyrics-error";
import { NativeBridgeUnavailableError } from "./errors/native-bridge-unavailable-error";
import { PlaybackError } from "./errors/playback-error";
import { SessionError } from "./errors/session-error";
import { SupersededError } from "./errors/superseded-error";
import type {
  AppearanceClient,
  LibraryClient,
  LyricsClient,
  MeterClient,
  NativeClients,
  PlaybackClient,
  SessionClient,
  WindowClient,
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

/** Runs a call with no domain errors: whatever it rejects with is IpcError. */
function ipc<T>(run: () => Promise<T>): Promise<T> {
  return callCommand(run, () => new IpcError());
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

  start(context: PlaybackContext, startTrackId: TrackId | null) {
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
  removeQueueItem(id: QueueItemId) {
    return this.#call(() => this.#commands.removeQueueItem(id));
  }
  moveQueueItem(id: QueueItemId, to: number) {
    return this.#call(() => this.#commands.moveQueueItem(id, to));
  }
  playQueueItem(id: QueueItemId) {
    return this.#call(() => this.#commands.playQueueItem(id));
  }
  enqueueTrack(trackId: TrackId, next: boolean) {
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

class TauriLibraryClient implements LibraryClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  status() {
    return this.#call(() => this.#commands.getLibraryStatus());
  }
  roots() {
    return this.#call(() => this.#commands.listLibraryRoots());
  }
  async selectDirectory() {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  registerRoot(path: string) {
    return this.#call(() => this.#commands.registerLibraryRoot(path));
  }
  setRootEnabled(id: string, enabled: boolean) {
    return this.#call(() => this.#commands.setLibraryRootEnabled(id, enabled));
  }
  async removeRoot(id: string) {
    await this.#call(() => this.#commands.removeLibraryRoot(id));
  }
  deleteMissing() {
    return this.#call(() => this.#commands.deleteMissingLibraryTracks());
  }
  async startScan() {
    await this.#call(() => this.#commands.startLibraryScan());
  }
  async cancelScan() {
    await this.#call(() => this.#commands.cancelLibraryScan());
  }
  async resetAndRescan() {
    await this.#call(() => this.#commands.resetLibraryAndRescan());
  }
  async openLogDirectory() {
    await this.#call(() => this.#commands.openLogDirectory());
  }
  tracks(
    cursor: string | null,
    search: string | null,
    sortKey: Parameters<Commands["listLibraryTracks"]>[2],
    direction: Parameters<Commands["listLibraryTracks"]>[3],
    skip: number,
  ) {
    return this.#call(() =>
      this.#commands.listLibraryTracks(cursor, search, sortKey, direction, skip),
    );
  }
  albums(
    cursor: string | null,
    search: string | null,
    sortKey: Parameters<Commands["listLibraryAlbums"]>[2],
    direction: Parameters<Commands["listLibraryAlbums"]>[3],
    skip: number,
  ) {
    return this.#call(() =>
      this.#commands.listLibraryAlbums(cursor, search, sortKey, direction, skip),
    );
  }
  albumArtists(
    cursor: string | null,
    search: string | null,
    sortKey: Parameters<Commands["listLibraryAlbumArtists"]>[2],
    direction: Parameters<Commands["listLibraryAlbumArtists"]>[3],
    skip: number,
  ) {
    return this.#call(() =>
      this.#commands.listLibraryAlbumArtists(cursor, search, sortKey, direction, skip),
    );
  }
  trackIndex(
    search: string | null,
    sortKey: Parameters<Commands["listLibraryTrackIndex"]>[1],
    direction: Parameters<Commands["listLibraryTrackIndex"]>[2],
  ) {
    return this.#call(() => this.#commands.listLibraryTrackIndex(search, sortKey, direction));
  }
  albumIndex(
    search: string | null,
    sortKey: Parameters<Commands["listLibraryAlbumIndex"]>[1],
    direction: Parameters<Commands["listLibraryAlbumIndex"]>[2],
  ) {
    return this.#call(() => this.#commands.listLibraryAlbumIndex(search, sortKey, direction));
  }
  albumArtistIndex(
    search: string | null,
    sortKey: Parameters<Commands["listLibraryAlbumArtistIndex"]>[1],
    direction: Parameters<Commands["listLibraryAlbumArtistIndex"]>[2],
  ) {
    return this.#call(() => this.#commands.listLibraryAlbumArtistIndex(search, sortKey, direction));
  }
  albumById(albumId: Parameters<Commands["getLibraryAlbum"]>[0]) {
    return this.#call(() => this.#commands.getLibraryAlbum(albumId));
  }
  albumTracksById(
    albumId: Parameters<Commands["listLibraryAlbumTracks"]>[0]["albumId"],
    cursor: string | null,
  ) {
    return this.#call(() => this.#commands.listLibraryAlbumTracks({ albumId, cursor }));
  }
  artist(artistId: Parameters<Commands["getLibraryArtist"]>[0]) {
    return this.#call(() => this.#commands.getLibraryArtist(artistId));
  }
  artistAlbums(request: Parameters<Commands["listLibraryArtistAlbums"]>[0]) {
    return this.#call(() => this.#commands.listLibraryArtistAlbums(request));
  }
  trackProperties(trackId: TrackId) {
    return this.#call(() => this.#commands.getLibraryTrackProperties(trackId));
  }
  async revealTrack(trackId: TrackId) {
    await this.#call(() => this.#commands.revealLibraryTrack(trackId));
  }
  artworkAccent(hash: ArtworkHash) {
    return this.#call(() => this.#commands.getArtworkAccent(hash));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: LibraryCommandError) => new LibraryError(error));
  }
}

class TauriLyricsClient implements LyricsClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  trackLyrics(trackId: TrackId) {
    return callCommand(
      () => this.#commands.getTrackLyrics(trackId),
      (error: LyricsCommandError) => new LyricsError(error),
    );
  }
}

class TauriMeterClient implements MeterClient {
  readonly #commands: Commands;

  constructor(source: Commands) {
    this.#commands = source;
  }

  async subscribe(onFrame: (frame: ArrayBuffer) => void) {
    const subscription = await ipc(() =>
      this.#commands.subscribeMeterFrames(new Channel<ArrayBuffer>(onFrame)),
    );
    return async () => {
      await ipc(() => this.#commands.unsubscribeMeterFrames(subscription));
    };
  }
}

/** The window chrome the renderer draws itself (the window has no native decorations). */
class TauriWindowClient implements WindowClient {
  minimize() {
    return ipc(() => getCurrentWindow().minimize());
  }
  toggleMaximize() {
    return ipc(() => getCurrentWindow().toggleMaximize());
  }
  close() {
    return ipc(() => getCurrentWindow().close());
  }
  onMaximizedChange(listener: (maximized: boolean) => void) {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () =>
      void appWindow.isMaximized().then((value) => {
        if (!disposed) listener(value);
      });
    sync();
    void appWindow.onResized(sync).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
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
      library: new TauriLibraryClient(commandSet),
      lyrics: new TauriLyricsClient(commandSet),
      meter: new TauriMeterClient(commandSet),
      window: new TauriWindowClient(),
    };
  }
}
