import { Channel, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  commands,
  type ArtworkHash,
  type AudioDeviceListError,
  type BackendMessage,
  type LibraryCommandError,
  type LibraryTrackProperties,
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
  LibraryAlbumArtistSummary,
  LibraryAlbumDetails,
  LibraryAlbumPage,
  LibraryAlbumTrackPage,
  LibraryIndexBucket,
  LibraryRoot,
  LibraryStatus,
  LibraryTrackPage,
  LyricsResolution,
  PlaybackQueueSnapshot,
  PlaybackQueueWindow,
  PlaybackSnapshot,
  PlaybackWaveform,
  Versioned,
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
    return this.#call(() => this.#commands.connect(new Channel<BackendMessage>(onMessage)));
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
  ): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.startPlayback(context, startTrackId));
  }
  public pause(): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.pausePlayback());
  }
  public resume(): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.resumePlayback());
  }
  public previous(): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.previousPlayback());
  }
  public next(): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.nextPlayback());
  }
  public seek(positionMs: number): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.seekPlayback(positionMs));
  }
  public setVolume(volume: number): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.setPlaybackVolume(volume));
  }
  public setMuted(muted: boolean): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.setPlaybackMuted(muted));
  }
  public setOutputSelection(
    selection: Parameters<Commands["setAudioOutputSelection"]>[0],
  ): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.setAudioOutputSelection(selection));
  }
  public setRepeatMode(
    mode: Parameters<Commands["setPlaybackRepeatMode"]>[0],
  ): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.setPlaybackRepeatMode(mode));
  }
  public setShuffle(enabled: boolean): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.setPlaybackShuffle(enabled));
  }
  public removeQueueItem(id: QueueItemId): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.removeQueueItem(id));
  }
  public moveQueueItem(id: QueueItemId, to: number): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.moveQueueItem(id, to));
  }
  public playQueueItem(id: QueueItemId): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.playQueueItem(id));
  }
  public enqueueTrack(trackId: TrackId, next: boolean): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.enqueueTrack(trackId, next));
  }
  public clearQueue(): Promise<Versioned<PlaybackQueueSnapshot>> {
    return this.#call(() => this.#commands.clearQueue());
  }
  public restorePreviousQueue(): Promise<Versioned<PlaybackSnapshot>> {
    return this.#call(() => this.#commands.restorePreviousQueue());
  }
  public queueWindow(offset: number, limit: number): Promise<PlaybackQueueWindow> {
    return this.#call(() => this.#commands.getPlaybackQueueWindow(offset, limit));
  }
  public waveform(): Promise<Versioned<PlaybackWaveform | null>> {
    return this.#call(() => this.#commands.getPlaybackWaveform());
  }
  public listOutputDevices(): Promise<AudioOutputDevice[]> {
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

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public update(
    patch: Parameters<Commands["updateAppearance"]>[0],
  ): Promise<Versioned<Appearance>> {
    return this.#call(() => this.#commands.updateAppearance(patch));
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
    return this.#call(() => this.#commands.getLibraryStatus());
  }
  public roots(): Promise<LibraryRoot[]> {
    return this.#call(() => this.#commands.listLibraryRoots());
  }
  public async selectDirectory(): Promise<string | null> {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  public registerRoot(path: string): Promise<LibraryRoot> {
    return this.#call(() => this.#commands.registerLibraryRoot(path));
  }
  public setRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot> {
    return this.#call(() => this.#commands.setLibraryRootEnabled(id, enabled));
  }
  public async removeRoot(id: string): Promise<void> {
    await this.#call(() => this.#commands.removeLibraryRoot(id));
  }
  public deleteMissing(): Promise<number> {
    return this.#call(() => this.#commands.deleteMissingLibraryTracks());
  }
  public async startScan(): Promise<void> {
    await this.#call(() => this.#commands.startLibraryScan());
  }
  public async cancelScan(): Promise<void> {
    await this.#call(() => this.#commands.cancelLibraryScan());
  }
  public async resetAndRescan(): Promise<void> {
    await this.#call(() => this.#commands.resetLibraryAndRescan());
  }
  public async openLogDirectory(): Promise<void> {
    await this.#call(() => this.#commands.openLogDirectory());
  }
  public tracks(request: Parameters<Commands["listLibraryTracks"]>[0]): Promise<LibraryTrackPage> {
    return this.#call(() => this.#commands.listLibraryTracks(request));
  }
  public albums(request: Parameters<Commands["listLibraryAlbums"]>[0]): Promise<LibraryAlbumPage> {
    return this.#call(() => this.#commands.listLibraryAlbums(request));
  }
  public albumArtists(
    request: Parameters<Commands["listLibraryAlbumArtists"]>[0],
  ): Promise<LibraryAlbumArtistPage> {
    return this.#call(() => this.#commands.listLibraryAlbumArtists(request));
  }
  public trackIndex(
    query: Parameters<Commands["listLibraryTrackIndex"]>[0],
  ): Promise<LibraryIndexBucket[]> {
    return this.#call(() => this.#commands.listLibraryTrackIndex(query));
  }
  public albumIndex(
    query: Parameters<Commands["listLibraryAlbumIndex"]>[0],
  ): Promise<LibraryIndexBucket[]> {
    return this.#call(() => this.#commands.listLibraryAlbumIndex(query));
  }
  public albumArtistIndex(
    query: Parameters<Commands["listLibraryAlbumArtistIndex"]>[0],
  ): Promise<LibraryIndexBucket[]> {
    return this.#call(() => this.#commands.listLibraryAlbumArtistIndex(query));
  }
  public albumById(
    albumId: Parameters<Commands["getLibraryAlbum"]>[0],
  ): Promise<LibraryAlbumDetails> {
    return this.#call(() => this.#commands.getLibraryAlbum(albumId));
  }
  public albumTracksById(
    albumId: Parameters<Commands["listLibraryAlbumTracks"]>[0]["albumId"],
    cursor: string | null,
  ): Promise<LibraryAlbumTrackPage> {
    return this.#call(() => this.#commands.listLibraryAlbumTracks({ albumId, cursor }));
  }
  public artist(
    artistId: Parameters<Commands["getLibraryArtist"]>[0],
  ): Promise<LibraryAlbumArtistSummary> {
    return this.#call(() => this.#commands.getLibraryArtist(artistId));
  }
  public artistAlbums(
    request: Parameters<Commands["listLibraryArtistAlbums"]>[0],
  ): Promise<LibraryAlbumPage> {
    return this.#call(() => this.#commands.listLibraryArtistAlbums(request));
  }
  public trackProperties(trackId: TrackId): Promise<LibraryTrackProperties> {
    return this.#call(() => this.#commands.getLibraryTrackProperties(trackId));
  }
  public async revealTrack(trackId: TrackId): Promise<void> {
    await this.#call(() => this.#commands.revealLibraryTrack(trackId));
  }
  public artworkAccent(hash: ArtworkHash): Promise<string | null> {
    return this.#call(() => this.#commands.getArtworkAccent(hash));
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
      () => this.#commands.getTrackLyrics(trackId),
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
      this.#commands.subscribeMeterFrames(new Channel<ArrayBuffer>(onFrame)),
    );
    return async (): Promise<void> => {
      await ipc(() => this.#commands.unsubscribeMeterFrames(subscription));
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
