import { Channel, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  commands,
  type ArtworkHash,
  type AudioDeviceListError,
  type BackendMessage,
  type LibraryCommandError,
  type TrackProperties,
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
import type {
  Appearance,
  AudioOutputDevice,
  InitialState,
  LibraryAlbumArtistPage,
  ArtistRow,
  AlbumDetails,
  LibraryAlbumPage,
  LibraryAlbumTrackPage,
  ScrollIndexBucket,
  LibraryDirectory,
  LibraryStatus,
  LibraryTrackPage,
  LyricsResolution,
  QueueState,
  QueueWindow,
  PlaybackState,
  Revisioned,
} from "./bindings";

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

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public connect(onMessage: (message: BackendMessage) => void): Promise<InitialState> {
    return this.#call(() => this.#commands.appConnect(new Channel<BackendMessage>(onMessage)));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: { readonly code: string }) => new SessionError(error));
  }
}

class TauriPlaybackClient implements PlaybackClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public start(
    context: PlaybackContext,
    startTrackId: TrackId | null,
  ): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerPlay(context, startTrackId));
  }
  public pause(): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerPause());
  }
  public resume(): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerResume());
  }
  public previous(): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerPrevious());
  }
  public next(): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerNext());
  }
  public seek(positionMs: number): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerSeek(positionMs));
  }
  public setVolume(volume: number): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerSetVolume(volume));
  }
  public setMuted(muted: boolean): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerSetMuted(muted));
  }
  public setOutputSelection(
    selection: Parameters<Commands["playerSetOutputSelection"]>[0],
  ): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerSetOutputSelection(selection));
  }
  public setRepeatMode(
    mode: Parameters<Commands["playerSetRepeatMode"]>[0],
  ): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerSetRepeatMode(mode));
  }
  public setShuffle(enabled: boolean): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerSetShuffle(enabled));
  }
  public playerRemoveQueueItem(id: QueueItemId): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerRemoveQueueItem(id));
  }
  public playerMoveQueueItem(id: QueueItemId, to: number): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerMoveQueueItem(id, to));
  }
  public playerPlayQueueItem(id: QueueItemId): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerPlayQueueItem(id));
  }
  public playerEnqueueTrack(trackId: TrackId, next: boolean): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerEnqueueTrack(trackId, next));
  }
  public playerClearQueue(): Promise<Revisioned<QueueState>> {
    return this.#call(() => this.#commands.playerClearQueue());
  }
  public playerRestorePreviousQueue(): Promise<Revisioned<PlaybackState>> {
    return this.#call(() => this.#commands.playerRestorePreviousQueue());
  }
  public queueWindow(offset: number, limit: number): Promise<QueueWindow> {
    return this.#call(() => this.#commands.playerQueueWindow(offset, limit));
  }
  public listOutputDevices(): Promise<AudioOutputDevice[]> {
    return callCommand(
      () => this.#commands.playerListOutputDevices(),
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

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public update(
    patch: Parameters<Commands["appearanceUpdate"]>[0],
  ): Promise<Revisioned<Appearance>> {
    return this.#call(() => this.#commands.appearanceUpdate(patch));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: { readonly code: string }) => new AppearanceError(error));
  }
}

class TauriLibraryClient implements LibraryClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public status(): Promise<LibraryStatus> {
    return this.#call(() => this.#commands.libraryStatus());
  }
  public directories(): Promise<LibraryDirectory[]> {
    return this.#call(() => this.#commands.libraryListDirectories());
  }
  public async selectDirectory(): Promise<string | null> {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  public registerDirectory(path: string): Promise<LibraryDirectory> {
    return this.#call(() => this.#commands.libraryAddDirectory(path));
  }
  public setDirectoryEnabled(id: number, enabled: boolean): Promise<LibraryDirectory> {
    return this.#call(() => this.#commands.librarySetDirectoryEnabled(id, enabled));
  }
  public async removeDirectory(id: number): Promise<void> {
    await this.#call(() => this.#commands.libraryRemoveDirectory(id));
  }
  public deleteMissing(): Promise<number> {
    return this.#call(() => this.#commands.libraryDeleteMissingTracks());
  }
  public async startScan(): Promise<void> {
    await this.#call(() => this.#commands.libraryStartScan());
  }
  public async cancelScan(): Promise<void> {
    await this.#call(() => this.#commands.libraryCancelScan());
  }
  public async resetAndRescan(): Promise<void> {
    await this.#call(() => this.#commands.libraryReset());
  }
  public async appOpenLogDirectory(): Promise<void> {
    await this.#call(() => this.#commands.appOpenLogDirectory());
  }
  public tracks(request: Parameters<Commands["libraryListTracks"]>[0]): Promise<LibraryTrackPage> {
    return this.#call(() => this.#commands.libraryListTracks(request));
  }
  public albums(request: Parameters<Commands["libraryListAlbums"]>[0]): Promise<LibraryAlbumPage> {
    return this.#call(() => this.#commands.libraryListAlbums(request));
  }
  public albumArtists(
    request: Parameters<Commands["libraryListArtists"]>[0],
  ): Promise<LibraryAlbumArtistPage> {
    return this.#call(() => this.#commands.libraryListArtists(request));
  }
  public trackIndex(
    query: Parameters<Commands["libraryTrackIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return this.#call(() => this.#commands.libraryTrackIndex(query));
  }
  public albumIndex(
    query: Parameters<Commands["libraryAlbumIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return this.#call(() => this.#commands.libraryAlbumIndex(query));
  }
  public albumArtistIndex(
    query: Parameters<Commands["libraryArtistIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return this.#call(() => this.#commands.libraryArtistIndex(query));
  }
  public albumById(albumId: Parameters<Commands["libraryAlbum"]>[0]): Promise<AlbumDetails> {
    return this.#call(() => this.#commands.libraryAlbum(albumId));
  }
  public albumTracksById(
    albumId: Parameters<Commands["libraryListAlbumTracks"]>[0]["albumId"],
    cursor: string | null,
  ): Promise<LibraryAlbumTrackPage> {
    return this.#call(() => this.#commands.libraryListAlbumTracks({ albumId, cursor }));
  }
  public artist(artistId: Parameters<Commands["libraryArtist"]>[0]): Promise<ArtistRow> {
    return this.#call(() => this.#commands.libraryArtist(artistId));
  }
  public artistAlbums(
    request: Parameters<Commands["libraryListArtistAlbums"]>[0],
  ): Promise<LibraryAlbumPage> {
    return this.#call(() => this.#commands.libraryListArtistAlbums(request));
  }
  public trackProperties(trackId: TrackId): Promise<TrackProperties> {
    return this.#call(() => this.#commands.libraryTrackProperties(trackId));
  }
  public async revealTrack(trackId: TrackId): Promise<void> {
    await this.#call(() => this.#commands.libraryRevealTrack(trackId));
  }
  public artworkAccent(hash: ArtworkHash): Promise<string | null> {
    return this.#call(() => this.#commands.libraryArtworkAccent(hash));
  }

  #call<T>(run: () => Promise<T>): Promise<T> {
    return callCommand(run, (error: LibraryCommandError) => new LibraryError(error));
  }
}

class TauriLyricsClient implements LyricsClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public trackLyrics(trackId: TrackId): Promise<LyricsResolution> {
    return callCommand(
      () => this.#commands.lyricsTrack(trackId),
      (error: LyricsCommandError) => new LyricsError(error),
    );
  }
}

class TauriMeterClient implements MeterClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public async subscribe(onFrame: (frame: ArrayBuffer) => void) {
    const subscription = await ipc(() =>
      this.#commands.meterStart(new Channel<ArrayBuffer>(onFrame)),
    );
    return async (): Promise<void> => {
      await ipc(() => this.#commands.meterStop(subscription));
    };
  }
}

/** The window chrome the renderer draws itself (the window has no native decorations). */
class TauriWindowClient implements WindowClient {
  public minimize(): Promise<void> {
    return ipc(() => getCurrentWindow().minimize());
  }
  public toggleMaximize(): Promise<void> {
    return ipc(() => getCurrentWindow().toggleMaximize());
  }
  public close(): Promise<void> {
    return ipc(() => getCurrentWindow().close());
  }
  public onMaximizedChange(listener: (maximized: boolean) => void) {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = (): undefined =>
      void appWindow.isMaximized().then((value) => {
        if (!disposed) listener(value);
      });
    sync();
    void appWindow
      .onResized(sync)
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => undefined);
    return (): void => {
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
