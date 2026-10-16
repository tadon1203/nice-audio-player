import type {
  Appearance,
  AppearancePatch,
  AudioOutputDevice,
  AudioOutputSelection,
  BackendMessage,
  InitialState,
  PlaybackContext,
  PlaybackQueueSnapshot,
  PlaybackQueueWindow,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  PlaybackWaveform,
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
    startTrackId: string | null,
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
  removeQueueItem(id: string): Promise<Versioned<PlaybackQueueSnapshot>>;
  moveQueueItem(id: string, to: number): Promise<Versioned<PlaybackQueueSnapshot>>;
  playQueueItem(id: string): Promise<Versioned<PlaybackSnapshot>>;
  enqueueTrack(trackId: string, next: boolean): Promise<Versioned<PlaybackQueueSnapshot>>;
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

export interface NativeClients {
  readonly session: SessionClient;
  readonly playback: PlaybackClient;
  readonly appearance: AppearanceClient;
}
