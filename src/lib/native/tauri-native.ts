import { Channel, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  commands,
  type ArtworkHash,
  type BackendMessage,
  type TrackProperties,
  type PlaybackContext,
  type QueueItemId,
  type TrackId,
} from "./bindings";
import { command } from "./commands";
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

class TauriSessionClient implements SessionClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public connect(onMessage: (message: BackendMessage) => void): Promise<InitialState> {
    return command("app", () => this.#commands.appConnect(new Channel<BackendMessage>(onMessage)));
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
    return command("player", () => this.#commands.playerPlay(context, startTrackId));
  }
  public pause(): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerPause());
  }
  public resume(): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerResume());
  }
  public previous(): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerPrevious());
  }
  public next(): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerNext());
  }
  public seek(positionMs: number): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerSeek(positionMs));
  }
  public setVolume(volume: number): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerSetVolume(volume));
  }
  public setMuted(muted: boolean): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerSetMuted(muted));
  }
  public setOutputSelection(
    selection: Parameters<Commands["playerSetOutputSelection"]>[0],
  ): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerSetOutputSelection(selection));
  }
  public setRepeatMode(
    mode: Parameters<Commands["playerSetRepeatMode"]>[0],
  ): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerSetRepeatMode(mode));
  }
  public setShuffle(enabled: boolean): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerSetShuffle(enabled));
  }
  public playerRemoveQueueItem(id: QueueItemId): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerRemoveQueueItem(id));
  }
  public playerMoveQueueItem(id: QueueItemId, to: number): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerMoveQueueItem(id, to));
  }
  public playerPlayQueueItem(id: QueueItemId): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerPlayQueueItem(id));
  }
  public playerEnqueueTrack(trackId: TrackId, next: boolean): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerEnqueueTrack(trackId, next));
  }
  public playerClearQueue(): Promise<Revisioned<QueueState>> {
    return command("player", () => this.#commands.playerClearQueue());
  }
  public playerRestorePreviousQueue(): Promise<Revisioned<PlaybackState>> {
    return command("player", () => this.#commands.playerRestorePreviousQueue());
  }
  public queueWindow(offset: number, limit: number): Promise<QueueWindow> {
    return command("player", () => this.#commands.playerQueueWindow(offset, limit));
  }
  public listOutputDevices(): Promise<AudioOutputDevice[]> {
    return command("player", () => this.#commands.playerListOutputDevices());
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
    return command("appearance", () => this.#commands.appearanceUpdate(patch));
  }
}

class TauriLibraryClient implements LibraryClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public status(): Promise<LibraryStatus> {
    return command("library", () => this.#commands.libraryStatus());
  }
  public directories(): Promise<LibraryDirectory[]> {
    return command("library", () => this.#commands.libraryListDirectories());
  }
  public async selectDirectory(): Promise<string | null> {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  public registerDirectory(path: string): Promise<LibraryDirectory> {
    return command("library", () => this.#commands.libraryAddDirectory(path));
  }
  public setDirectoryEnabled(id: number, enabled: boolean): Promise<LibraryDirectory> {
    return command("library", () => this.#commands.librarySetDirectoryEnabled(id, enabled));
  }
  public async removeDirectory(id: number): Promise<void> {
    await command("library", () => this.#commands.libraryRemoveDirectory(id));
  }
  public deleteMissing(): Promise<number> {
    return command("library", () => this.#commands.libraryDeleteMissingTracks());
  }
  public async startScan(): Promise<void> {
    await command("library", () => this.#commands.libraryStartScan());
  }
  public async cancelScan(): Promise<void> {
    await command("library", () => this.#commands.libraryCancelScan());
  }
  public async resetAndRescan(): Promise<void> {
    await command("library", () => this.#commands.libraryReset());
  }
  public async appOpenLogDirectory(): Promise<void> {
    await command("app", () => this.#commands.appOpenLogDirectory());
  }
  public tracks(request: Parameters<Commands["libraryListTracks"]>[0]): Promise<LibraryTrackPage> {
    return command("library", () => this.#commands.libraryListTracks(request));
  }
  public albums(request: Parameters<Commands["libraryListAlbums"]>[0]): Promise<LibraryAlbumPage> {
    return command("library", () => this.#commands.libraryListAlbums(request));
  }
  public albumArtists(
    request: Parameters<Commands["libraryListArtists"]>[0],
  ): Promise<LibraryAlbumArtistPage> {
    return command("library", () => this.#commands.libraryListArtists(request));
  }
  public trackIndex(
    query: Parameters<Commands["libraryTrackIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return command("library", () => this.#commands.libraryTrackIndex(query));
  }
  public albumIndex(
    query: Parameters<Commands["libraryAlbumIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return command("library", () => this.#commands.libraryAlbumIndex(query));
  }
  public albumArtistIndex(
    query: Parameters<Commands["libraryArtistIndex"]>[0],
  ): Promise<ScrollIndexBucket[]> {
    return command("library", () => this.#commands.libraryArtistIndex(query));
  }
  public albumById(albumId: Parameters<Commands["libraryAlbum"]>[0]): Promise<AlbumDetails> {
    return command("library", () => this.#commands.libraryAlbum(albumId));
  }
  public albumTracksById(
    albumId: Parameters<Commands["libraryListAlbumTracks"]>[0]["albumId"],
    cursor: string | null,
  ): Promise<LibraryAlbumTrackPage> {
    return command("library", () => this.#commands.libraryListAlbumTracks({ albumId, cursor }));
  }
  public artist(artistId: Parameters<Commands["libraryArtist"]>[0]): Promise<ArtistRow> {
    return command("library", () => this.#commands.libraryArtist(artistId));
  }
  public artistAlbums(
    request: Parameters<Commands["libraryListArtistAlbums"]>[0],
  ): Promise<LibraryAlbumPage> {
    return command("library", () => this.#commands.libraryListArtistAlbums(request));
  }
  public trackProperties(trackId: TrackId): Promise<TrackProperties> {
    return command("library", () => this.#commands.libraryTrackProperties(trackId));
  }
  public async revealTrack(trackId: TrackId): Promise<void> {
    await command("library", () => this.#commands.libraryRevealTrack(trackId));
  }
  public artworkAccent(hash: ArtworkHash): Promise<string | null> {
    return command("library", () => this.#commands.libraryArtworkAccent(hash));
  }
}

class TauriLyricsClient implements LyricsClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public trackLyrics(trackId: TrackId): Promise<LyricsResolution> {
    return command("lyrics", () => this.#commands.lyricsTrack(trackId));
  }
}

class TauriMeterClient implements MeterClient {
  readonly #commands: Commands;

  public constructor(source: Commands) {
    this.#commands = source;
  }

  public async subscribe(onFrame: (frame: ArrayBuffer) => void) {
    const subscription = await command("meter", () =>
      this.#commands.meterStart(new Channel<ArrayBuffer>(onFrame)),
    );
    return async (): Promise<void> => {
      await command("meter", () => this.#commands.meterStop(subscription));
    };
  }
}

/** The window chrome the renderer draws itself (the window has no native decorations). */
class TauriWindowClient implements WindowClient {
  public minimize(): Promise<void> {
    return command("app", () => getCurrentWindow().minimize());
  }
  public toggleMaximize(): Promise<void> {
    return command("app", () => getCurrentWindow().toggleMaximize());
  }
  public close(): Promise<void> {
    return command("app", () => getCurrentWindow().close());
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
   * The Tauri clients, or null outside the desktop app. Tests pass `source`, a fake command set,
   * and then the desktop check is skipped.
   */
  public static clients(source?: Commands): NativeClients | null {
    if (source === undefined && (typeof window === "undefined" || !isTauri())) return null;
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
