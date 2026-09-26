import { create, type StoreApi, type UseBoundStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  AppEvent,
  LibraryAlbumKey,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
  TNativeAPI,
} from "@/shared/ipc";
import { useLibraryTrackForPath } from "@/renderer/entities/library";
import { playbackCommandErrorMessage } from "./playback-errors";

export type PlaybackConnection = "loading" | "ready" | "failed";
export type TransportCommand =
  | "startTrack"
  | "startAlbum"
  | "pause"
  | "resume"
  | "previous"
  | "next";

export type PlaybackStoreState = {
  snapshot: PlaybackSnapshot | null;
  queue: PlaybackQueueSnapshot | null;
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

export function createPlaybackStore(): UseBoundStore<StoreApi<PlaybackStoreState>> {
  return create<PlaybackStoreState>(() => ({
    snapshot: null,
    queue: null,
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

  const setError = (error: unknown) =>
    store.setState({ error: error ? playbackCommandErrorMessage(error) : null });

  const acceptPlayback = (snapshot: PlaybackSnapshot) => {
    const current = store.getState().playbackRevision;
    if (!acceptsRevision(snapshot.revision, current)) return;
    store.setState({ snapshot, playbackRevision: snapshot.revision });
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
    startLibraryTrack: (id: string) => runTransport("startTrack", () => api!.startLibraryTrack(id)),
    startLibraryAlbum: (key: LibraryAlbumKey) =>
      runTransport("startAlbum", () => api!.startLibraryAlbum(key)),
    pause: () => runTransport("pause", () => api!.pausePlayback()),
    resume: () => runTransport("resume", () => api!.resumePlayback()),
    previous: () => runTransport("previous", () => api!.previousPlayback()),
    next: () => runTransport("next", () => api!.nextPlayback()),
    seek: async (positionMs: number) => {
      if (!api || store.getState().seekPending) return;
      store.setState({ seekPending: true, error: null });
      const duration = selectDuration(store.getState().snapshot);
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
    toggleMute: async () => {
      if (!api || store.getState().mutePending) return;
      store.setState({ mutePending: true, error: null });
      try {
        acceptPlayback(await api.setPlaybackMuted(!selectMuted(store.getState().snapshot)));
      } catch (error) {
        setError(error);
      } finally {
        store.setState({ mutePending: false });
      }
    },
    select: () => selectSession(store.getState(), api !== null),
  };
}

export type ActivePlaybackSnapshot = Extract<PlaybackSnapshot, { status: "playing" | "paused" }>;

/** True while a track is loaded, whether it is playing or paused. */
export function isActivePlayback(
  snapshot: PlaybackSnapshot | null | undefined,
): snapshot is ActivePlaybackSnapshot {
  return snapshot?.status === "playing" || snapshot?.status === "paused";
}

function selectDuration(snapshot: PlaybackSnapshot | null) {
  return isActivePlayback(snapshot) ? snapshot.durationMs : null;
}

function selectMuted(snapshot: PlaybackSnapshot | null) {
  return snapshot?.muted ?? false;
}

type PlaybackSessionState = Pick<
  PlaybackStoreState,
  | "snapshot"
  | "queue"
  | "connection"
  | "transportPending"
  | "seekPending"
  | "volumePending"
  | "mutePending"
  | "volumePreview"
  | "error"
>;

function selectSession(state: PlaybackSessionState, bridgeAvailable: boolean) {
  const snapshot = state.snapshot;
  const active = isActivePlayback(snapshot);
  return {
    snapshot,
    queue: state.queue,
    connection: bridgeAvailable ? state.connection : ("failed" as PlaybackConnection),
    transportPending: state.transportPending,
    seekPending: state.seekPending,
    volumePending: state.volumePending,
    mutePending: state.mutePending,
    commandError: state.error,
    positionMs: active && snapshot && "positionMs" in snapshot ? snapshot.positionMs : 0,
    durationMs: active && snapshot && "durationMs" in snapshot ? snapshot.durationMs : null,
    volume: state.volumePreview ?? snapshot?.volume ?? 1,
    muted: snapshot?.muted ?? false,
  };
}

export const usePlaybackStore = createPlaybackStore();
export const playbackController = createPlaybackController(usePlaybackStore);

const playbackActions = {
  startLibraryTrack: playbackController.startLibraryTrack,
  startLibraryAlbum: playbackController.startLibraryAlbum,
  pause: playbackController.pause,
  resume: playbackController.resume,
  previous: playbackController.previous,
  next: playbackController.next,
  seek: playbackController.seek,
  setVolume: playbackController.setVolume,
  toggleMute: playbackController.toggleMute,
} as const;

export function usePlaybackActions() {
  return playbackActions;
}

export function usePlaybackSession() {
  const state = usePlaybackStore(
    useShallow((current) => ({
      snapshot: current.snapshot,
      queue: current.queue,
      connection: current.connection,
      transportPending: current.transportPending,
      seekPending: current.seekPending,
      volumePending: current.volumePending,
      mutePending: current.mutePending,
      volumePreview: current.volumePreview,
      error: current.error,
    })),
  );
  const currentTrack = useLibraryTrackForPath(state.snapshot?.file?.path ?? null).data ?? null;
  const selected = selectSession(state, true);

  return {
    ...selected,
    currentTrack,
    title:
      currentTrack?.title ?? state.queue?.current?.title ?? state.snapshot?.file?.fileName ?? null,
    artist: currentTrack?.artist ?? state.queue?.current?.artist ?? null,
    artwork: currentTrack?.artwork ?? null,
    ...playbackActions,
  };
}

export function useTrackPlaybackState() {
  const selection = usePlaybackStore(
    useShallow((state) => ({
      path: state.snapshot?.file?.path ?? null,
      status: state.snapshot?.status ?? "stopped",
    })),
  );
  const currentTrack = useLibraryTrackForPath(selection.path).data ?? null;
  return {
    activeTrackId: currentTrack?.id ?? null,
    playbackStatus: selection.status,
  };
}
