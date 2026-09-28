import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  ActiveSession,
  AppEvent,
  AudioOutputSelection,
  PlaybackContext,
  PlaybackItem,
  PlaybackQueueMoveDirection,
  PlaybackQueueSnapshot,
  PlaybackRepeatMode,
  PlaybackSnapshot,
  TNativeAPI,
} from "@/shared/ipc";
import { nativeErrorCode } from "@/renderer/shared/lib/native-error";
import { playbackCommandErrorMessage } from "./playback-errors";

export type PlaybackConnection = "loading" | "ready" | "failed";
export type TransportCommand =
  | "start"
  | "pause"
  | "resume"
  | "previous"
  | "next"
  | "outputSelection";

/**
 * Mirrors the backend's playback state. The fields below `snapshot` are derived from it when a
 * snapshot is accepted, so a component can subscribe to exactly what it shows: a position tick
 * changes `positionMs` and nothing else, and `item` keeps its identity while the same queue
 * item plays.
 */
export type PlaybackStoreState = {
  snapshot: PlaybackSnapshot | null;
  queue: PlaybackQueueSnapshot | null;
  item: PlaybackItem | null;
  positionMs: number;
  durationMs: number | null;
  playbackRevision: number | null;
  queueRevision: number | null;
  connection: PlaybackConnection;
  transportPending: TransportCommand | null;
  seekPending: boolean;
  volumePending: boolean;
  mutePending: boolean;
  volumePreview: number | null;
  error: string | null;
};

const acceptsRevision = (incoming: number | null, current: number | null) =>
  incoming === null ? current === null : current === null || incoming >= current;

export type ActivePlaybackSnapshot = Extract<PlaybackSnapshot, { status: "playing" | "paused" }>;

/** True while a track is loaded, whether it is playing or paused. */
export function isActivePlayback(
  snapshot: PlaybackSnapshot | null | undefined,
): snapshot is ActivePlaybackSnapshot {
  return snapshot?.status === "playing" || snapshot?.status === "paused";
}

export function snapshotSession(snapshot: PlaybackSnapshot | null): ActiveSession | null {
  return isActivePlayback(snapshot) ? snapshot.session : null;
}

/** The loaded track, or the last one that played while stopped. */
export function snapshotItem(snapshot: PlaybackSnapshot | null): PlaybackItem | null {
  if (snapshot === null) return null;
  return isActivePlayback(snapshot) ? snapshot.session.item : snapshot.item;
}

export function createPlaybackStore(): UseBoundStore<StoreApi<PlaybackStoreState>> {
  return create<PlaybackStoreState>(() => ({
    snapshot: null,
    queue: null,
    item: null,
    positionMs: 0,
    durationMs: null,
    playbackRevision: null,
    queueRevision: null,
    connection: "loading",
    transportPending: null,
    seekPending: false,
    volumePending: false,
    mutePending: false,
    volumePreview: null,
    error: null,
  }));
}

export function createPlaybackController(store: UseBoundStore<StoreApi<PlaybackStoreState>>) {
  let api: TNativeAPI | null = null;
  let initializePromise: Promise<void> | null = null;
  let initializedApi: TNativeAPI | null = null;
  let requestedVolume: number | null = null;
  let volumeWriteActive = false;

  const setError = (error: unknown) => {
    // A request replaced by a newer one has nothing to report.
    if (nativeErrorCode(error) === "superseded") return;
    store.setState({ error: error ? playbackCommandErrorMessage(error) : null });
  };

  const acceptPlayback = (snapshot: PlaybackSnapshot) => {
    const state = store.getState();
    if (!acceptsRevision(snapshot.base.revision, state.playbackRevision)) return;
    const incoming = snapshotItem(snapshot);
    const item =
      incoming !== null && state.item?.queueItemId === incoming.queueItemId ? state.item : incoming;
    const session = snapshotSession(snapshot);
    store.setState({
      snapshot,
      item,
      positionMs: session?.positionMs ?? 0,
      durationMs: session?.durationMs ?? null,
      playbackRevision: snapshot.base.revision,
    });
  };

  const acceptQueue = (queue: PlaybackQueueSnapshot) => {
    const current = store.getState().queueRevision;
    if (!acceptsRevision(queue.revision, current)) return;
    store.setState({ queue, queueRevision: queue.revision });
  };

  const acceptEvent = (event: AppEvent) => {
    if (event.event === "playbackStateChanged") acceptPlayback(event.payload);
    if (event.event === "playbackQueueStateChanged") acceptQueue(event.payload);
  };

  const runTransport = async (
    command: TransportCommand,
    operation: () => Promise<PlaybackSnapshot>,
  ) => {
    if (!api || store.getState().transportPending !== null) return;
    store.setState({ transportPending: command, error: null });
    try {
      acceptPlayback(await operation());
    } catch (error) {
      setError(error);
    } finally {
      store.setState({ transportPending: null });
    }
  };

  const runQueueCommand = async (operation: () => Promise<PlaybackQueueSnapshot>) => {
    if (!api) return;
    store.setState({ error: null });
    try {
      acceptQueue(await operation());
    } catch (error) {
      setError(error);
    }
  };

  const flushVolume = async () => {
    if (!api || volumeWriteActive) return;
    volumeWriteActive = true;
    store.setState({ volumePending: true, error: null });
    try {
      while (requestedVolume !== null) {
        const value = requestedVolume;
        requestedVolume = null;
        acceptPlayback(await api.setPlaybackVolume(value));
      }
      store.setState({ volumePreview: null });
    } catch (error) {
      requestedVolume = null;
      store.setState({ volumePreview: null });
      setError(error);
    } finally {
      volumeWriteActive = false;
      store.setState({ volumePending: false });
    }
  };

  const initialize = async (nextApi: TNativeAPI) => {
    if (initializePromise && initializedApi === nextApi) return initializePromise;
    initializedApi = nextApi;
    api = nextApi;
    store.setState({ connection: "loading", error: null });
    initializePromise = (async () => {
      try {
        const [snapshot, queue] = await Promise.all([
          nextApi.getPlaybackState(),
          nextApi.getPlaybackQueue(),
        ]);
        acceptPlayback(snapshot);
        acceptQueue(queue);
        store.setState({ connection: "ready" });
      } catch (error) {
        store.setState({
          connection: "failed",
          error: playbackCommandErrorMessage(error),
        });
      }
    })();
    return initializePromise;
  };

  return {
    initialize,
    acceptEvent,
    acceptPlayback,
    acceptQueue,
    /** Replaces the queue with `context` and plays from `startTrackId` (its first track if null). */
    startPlayback: (context: PlaybackContext, startTrackId: string | null) =>
      runTransport("start", () => api!.startPlayback(context, startTrackId)),
    pause: () => runTransport("pause", () => api!.pausePlayback()),
    resume: () => runTransport("resume", () => api!.resumePlayback()),
    previous: () => runTransport("previous", () => api!.previousPlayback()),
    next: () => runTransport("next", () => api!.nextPlayback()),
    seek: async (positionMs: number) => {
      if (!api || store.getState().seekPending) return;
      store.setState({ seekPending: true, error: null });
      const duration = store.getState().durationMs;
      const requested =
        duration === null ? positionMs : Math.min(Math.max(positionMs, 0), duration);
      try {
        acceptPlayback(await api.seekPlayback(requested));
      } catch (error) {
        setError(error);
      } finally {
        store.setState({ seekPending: false });
      }
    },
    setVolume: (value: number) => {
      if (!api) return;
      requestedVolume = Math.max(0, Math.min(1, value));
      store.setState({ volumePreview: requestedVolume });
      void flushVolume();
    },
    setShuffle: (enabled: boolean) => runQueueCommand(() => api!.setPlaybackShuffle(enabled)),
    setRepeatMode: (mode: PlaybackRepeatMode) =>
      runQueueCommand(() => api!.setPlaybackRepeatMode(mode)),
    removeQueueItem: (id: string) => runQueueCommand(() => api!.removeQueueItem(id)),
    moveQueueItem: (id: string, direction: PlaybackQueueMoveDirection) =>
      runQueueCommand(() => api!.moveQueueItem(id, direction)),
    clearQueue: () => runQueueCommand(() => api!.clearQueue()),
    /** A loaded track restarts on the new device at the same position. */
    setOutputSelection: (selection: AudioOutputSelection) =>
      runTransport("outputSelection", () => api!.setAudioOutputSelection(selection)),
    toggleMute: async () => {
      if (!api || store.getState().mutePending) return;
      store.setState({ mutePending: true, error: null });
      try {
        const muted = store.getState().snapshot?.base.muted ?? false;
        acceptPlayback(await api.setPlaybackMuted(!muted));
      } catch (error) {
        setError(error);
      } finally {
        store.setState({ mutePending: false });
      }
    },
  };
}

/** Repeat cycles off, all, one; `↻¹` is the last step. */
export function nextRepeatMode(mode: PlaybackRepeatMode): PlaybackRepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}

export const usePlaybackStore = createPlaybackStore();
export const playbackController = createPlaybackController(usePlaybackStore);
