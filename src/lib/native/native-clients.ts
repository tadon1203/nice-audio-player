import type {
  Appearance,
  AppearancePatch,
  AudioOutputDevice,
  ArtworkHash,
  AudioOutputSelection,
  BackendMessage,
  InitialState,
  LibraryAlbumArtistPage,
  ArtistRow,
  AlbumDetails,
  LibraryAlbumPage,
  LibraryAlbumTrackPage,
  AlbumArtistListRequest,
  AlbumArtistQuery,
  AlbumId,
  AlbumListRequest,
  AlbumQuery,
  ArtistAlbumsRequest,
  ArtistId,
  ScrollIndexBucket,
  LibraryDirectory,
  LibraryStatus,
  LibraryTrackPage,
  TrackProperties,
  LyricsResolution,
  PlaybackContext,
  QueueState,
  QueueWindow,
  RepeatMode,
  PlaybackState,
  QueueItemId,
  TrackId,
  TrackListRequest,
  TrackQuery,
  Revisioned,
} from "./bindings";

/** The one channel to the Backend: subscribes, then fetches the current state. */
export interface SessionClient {
  /** Registers `onMessage`, then returns the current value of every topic. */
  connect(onMessage: (message: BackendMessage) => void): Promise<InitialState>;
}

export interface PlaybackClient {
  start(context: PlaybackContext, startTrackId: TrackId | null): Promise<Revisioned<PlaybackState>>;
  pause(): Promise<Revisioned<PlaybackState>>;
  resume(): Promise<Revisioned<PlaybackState>>;
  previous(): Promise<Revisioned<PlaybackState>>;
  next(): Promise<Revisioned<PlaybackState>>;
  seek(positionMs: number): Promise<Revisioned<PlaybackState>>;
  setVolume(volume: number): Promise<Revisioned<PlaybackState>>;
  setMuted(muted: boolean): Promise<Revisioned<PlaybackState>>;
  setOutputSelection(selection: AudioOutputSelection): Promise<Revisioned<PlaybackState>>;
  setRepeatMode(mode: RepeatMode): Promise<Revisioned<QueueState>>;
  setShuffle(enabled: boolean): Promise<Revisioned<QueueState>>;
  playerRemoveQueueItem(id: QueueItemId): Promise<Revisioned<QueueState>>;
  playerMoveQueueItem(id: QueueItemId, to: number): Promise<Revisioned<QueueState>>;
  playerPlayQueueItem(id: QueueItemId): Promise<Revisioned<PlaybackState>>;
  playerEnqueueTrack(trackId: TrackId, next: boolean): Promise<Revisioned<QueueState>>;
  playerClearQueue(): Promise<Revisioned<QueueState>>;
  playerRestorePreviousQueue(): Promise<Revisioned<PlaybackState>>;
  queueWindow(offset: number, limit: number): Promise<QueueWindow>;
  listOutputDevices(): Promise<AudioOutputDevice[]>;
}

export interface AppearanceClient {
  update(patch: AppearancePatch): Promise<Revisioned<Appearance>>;
}

/**
 * The Library commands. A list or index command takes one request or query object, as the
 * generated bindings do.
 */
export interface LibraryClient {
  status(): Promise<LibraryStatus>;
  directories(): Promise<LibraryDirectory[]>;
  /** Resolves null when the user closes the directory dialog. */
  selectDirectory(): Promise<string | null>;
  registerDirectory(path: string): Promise<LibraryDirectory>;
  setDirectoryEnabled(id: number, enabled: boolean): Promise<LibraryDirectory>;
  removeDirectory(id: number): Promise<void>;
  deleteMissing(): Promise<number>;
  startScan(): Promise<void>;
  cancelScan(): Promise<void>;
  resetAndRescan(): Promise<void>;
  appOpenLogDirectory(): Promise<void>;
  tracks(request: TrackListRequest): Promise<LibraryTrackPage>;
  albums(request: AlbumListRequest): Promise<LibraryAlbumPage>;
  albumArtists(request: AlbumArtistListRequest): Promise<LibraryAlbumArtistPage>;
  trackIndex(query: TrackQuery): Promise<ScrollIndexBucket[]>;
  albumIndex(query: AlbumQuery): Promise<ScrollIndexBucket[]>;
  albumArtistIndex(query: AlbumArtistQuery): Promise<ScrollIndexBucket[]>;
  albumById(albumId: AlbumId): Promise<AlbumDetails>;
  albumTracksById(albumId: AlbumId, cursor: string | null): Promise<LibraryAlbumTrackPage>;
  artist(artistId: ArtistId): Promise<ArtistRow>;
  artistAlbums(request: ArtistAlbumsRequest): Promise<LibraryAlbumPage>;
  trackProperties(trackId: TrackId): Promise<TrackProperties>;
  revealTrack(trackId: TrackId): Promise<void>;
  artworkAccent(hash: ArtworkHash): Promise<string | null>;
}

export interface LyricsClient {
  trackLyrics(trackId: TrackId): Promise<LyricsResolution>;
}

export interface MeterClient {
  /** Starts the Meter frames. Returns the function that ends them. */
  subscribe(onFrame: (frame: ArrayBuffer) => void): Promise<() => Promise<void>>;
}

export interface WindowClient {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  /** Calls `listener` with the current state now and on each change. Returns the unsubscribe. */
  onMaximizedChange(listener: (maximized: boolean) => void): () => void;
}

export interface NativeClients {
  readonly session: SessionClient;
  readonly playback: PlaybackClient;
  readonly appearance: AppearanceClient;
  readonly library: LibraryClient;
  readonly lyrics: LyricsClient;
  readonly meter: MeterClient;
  readonly window: WindowClient;
}
