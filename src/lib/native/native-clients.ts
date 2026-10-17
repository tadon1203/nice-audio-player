import type {
  Appearance,
  AppearancePatch,
  AudioOutputDevice,
  ArtworkHash,
  AudioOutputSelection,
  BackendMessage,
  InitialState,
  LibraryAlbumArtistKey,
  LibraryAlbumArtistPage,
  LibraryAlbumArtistSortKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumDetails,
  LibraryAlbumKey,
  LibraryAlbumPage,
  LibraryAlbumSortKey,
  LibraryAlbumTrackPage,
  ArtistAlbumsRequest,
  ArtistId,
  LibraryArtistAlbumSortKey,
  LibraryIndexBucket,
  LibraryRoot,
  LibrarySortDirection,
  LibraryStatus,
  LibraryTrackPage,
  LibraryTrackProperties,
  LibraryTrackSortKey,
  LyricsResolution,
  PlaybackContext,
  PlaybackQueueSnapshot,
  PlaybackQueueWindow,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  PlaybackWaveform,
  QueueItemId,
  TrackId,
  Versioned,
} from "./bindings";

/** The one channel to the Backend: subscribes, then fetches the current state. */
export interface SessionClient {
  /** Registers `onMessage`, then returns the current value of every topic. */
  connect(onMessage: (message: BackendMessage) => void): Promise<InitialState>;
}

export interface PlaybackClient {
  start(
    context: PlaybackContext,
    startTrackId: TrackId | null,
  ): Promise<Versioned<PlaybackSnapshot>>;
  pause(): Promise<Versioned<PlaybackSnapshot>>;
  resume(): Promise<Versioned<PlaybackSnapshot>>;
  previous(): Promise<Versioned<PlaybackSnapshot>>;
  next(): Promise<Versioned<PlaybackSnapshot>>;
  seek(positionMs: number): Promise<Versioned<PlaybackSnapshot>>;
  setVolume(volume: number): Promise<Versioned<PlaybackSnapshot>>;
  setMuted(muted: boolean): Promise<Versioned<PlaybackSnapshot>>;
  setOutputSelection(selection: AudioOutputSelection): Promise<Versioned<PlaybackSnapshot>>;
  setRepeatMode(mode: PlaybackRepeatMode): Promise<Versioned<PlaybackQueueSnapshot>>;
  setShuffle(enabled: boolean): Promise<Versioned<PlaybackQueueSnapshot>>;
  removeQueueItem(id: QueueItemId): Promise<Versioned<PlaybackQueueSnapshot>>;
  moveQueueItem(id: QueueItemId, to: number): Promise<Versioned<PlaybackQueueSnapshot>>;
  playQueueItem(id: QueueItemId): Promise<Versioned<PlaybackSnapshot>>;
  enqueueTrack(trackId: TrackId, next: boolean): Promise<Versioned<PlaybackQueueSnapshot>>;
  clearQueue(): Promise<Versioned<PlaybackQueueSnapshot>>;
  restorePreviousQueue(): Promise<Versioned<PlaybackSnapshot>>;
  queueWindow(offset: number, limit: number): Promise<PlaybackQueueWindow>;
  /** The loaded track's Waveform, or null while it is analyzed. Also queues the analysis. */
  waveform(): Promise<Versioned<PlaybackWaveform | null>>;
  listOutputDevices(): Promise<AudioOutputDevice[]>;
}

export interface AppearanceClient {
  update(patch: AppearancePatch): Promise<Versioned<Appearance>>;
}

/**
 * The Library commands. List arguments are positional, as the generated bindings take them; the
 * ID parameters keep their current types until the track and album ID tickets change them.
 */
export interface LibraryClient {
  status(): Promise<LibraryStatus>;
  roots(): Promise<LibraryRoot[]>;
  /** Resolves null when the user closes the folder dialog. */
  selectDirectory(): Promise<string | null>;
  registerRoot(path: string): Promise<LibraryRoot>;
  setRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot>;
  removeRoot(id: string): Promise<void>;
  deleteMissing(): Promise<number>;
  startScan(): Promise<void>;
  cancelScan(): Promise<void>;
  resetAndRescan(): Promise<void>;
  openLogDirectory(): Promise<void>;
  tracks(
    cursor: string | null,
    search: string | null,
    sortKey: LibraryTrackSortKey,
    direction: LibrarySortDirection,
    skip: number,
  ): Promise<LibraryTrackPage>;
  albums(
    cursor: string | null,
    search: string | null,
    sortKey: LibraryAlbumSortKey,
    direction: LibrarySortDirection,
    skip: number,
  ): Promise<LibraryAlbumPage>;
  albumArtists(
    cursor: string | null,
    search: string | null,
    sortKey: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
    skip: number,
  ): Promise<LibraryAlbumArtistPage>;
  trackIndex(
    search: string | null,
    sortKey: LibraryTrackSortKey,
    direction: LibrarySortDirection,
  ): Promise<LibraryIndexBucket[]>;
  albumIndex(
    search: string | null,
    sortKey: LibraryAlbumSortKey,
    direction: LibrarySortDirection,
  ): Promise<LibraryIndexBucket[]>;
  albumArtistIndex(
    search: string | null,
    sortKey: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
  ): Promise<LibraryIndexBucket[]>;
  album(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails>;
  albumTracks(albumKey: LibraryAlbumKey, cursor: string | null): Promise<LibraryAlbumTrackPage>;
  artist(artistId: ArtistId): Promise<LibraryAlbumArtistSummary>;
  artistAlbums(request: ArtistAlbumsRequest): Promise<LibraryAlbumPage>;
  /** The old name route, until that route is removed. */
  albumArtist(artistKey: LibraryAlbumArtistKey): Promise<LibraryAlbumArtistSummary>;
  albumArtistAlbums(
    artistKey: LibraryAlbumArtistKey,
    cursor: string | null,
    sortKey: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
  ): Promise<LibraryAlbumPage>;
  trackProperties(trackId: TrackId): Promise<LibraryTrackProperties | null>;
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
