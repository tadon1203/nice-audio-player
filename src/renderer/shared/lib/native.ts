import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { IPC_CHANNELS, ipcEventSchemas, ipcRequestSchemas, ipcResponseSchemas } from "@/shared/ipc";
import type { AppEvent, IpcChannel, IpcRequestMap, IpcResponseMap, TNativeAPI } from "@/shared/ipc";

export class NativeBridgeUnavailableError extends Error {
  readonly code = "nativeBridgeUnavailable";

  constructor() {
    super("Native application bridge is unavailable");
    this.name = "NativeBridgeUnavailableError";
  }
}

class NativeCommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "NativeCommandError";
  }
}

function normalizeError(error: unknown): NativeCommandError {
  const message = typeof error === "string" ? error : "Native command failed";
  const code = /^nativeError:([A-Za-z]+)$/.exec(message)?.[1] ?? "ipcError";
  return new NativeCommandError(code, message);
}

async function invokeCommand<Channel extends IpcChannel>(
  channel: Channel,
  args: IpcRequestMap[Channel],
  command: string,
  payload?: Record<string, unknown>,
): Promise<IpcResponseMap[Channel]> {
  const request = ipcRequestSchemas[channel].safeParse(args);
  if (!request.success) throw new NativeCommandError("invalidArgument", "Invalid IPC arguments");

  let result: unknown;
  try {
    result = await invoke<unknown>(command, payload);
  } catch (error) {
    throw normalizeError(error);
  }

  const responseSchema = ipcResponseSchemas[channel];
  const response = responseSchema.safeParse(
    result === null && responseSchema.safeParse(undefined).success ? undefined : result,
  );
  if (!response.success) throw new NativeCommandError("ipcProtocolError", "Invalid IPC response");
  return response.data as IpcResponseMap[Channel];
}

const tauriApi: TNativeAPI = {
  getPlaybackState: () => invokeCommand(IPC_CHANNELS.playback.getState, [], "get_playback_state"),
  getPlaybackQueue: () => invokeCommand(IPC_CHANNELS.playback.getQueue, [], "get_playback_queue"),
  pausePlayback: () => invokeCommand(IPC_CHANNELS.playback.pause, [], "pause_playback"),
  resumePlayback: () => invokeCommand(IPC_CHANNELS.playback.resume, [], "resume_playback"),
  previousPlayback: () => invokeCommand(IPC_CHANNELS.playback.previous, [], "previous_playback"),
  nextPlayback: () => invokeCommand(IPC_CHANNELS.playback.next, [], "next_playback"),
  seekPlayback: (...args) =>
    invokeCommand(IPC_CHANNELS.playback.seek, args, "seek_playback", { positionMs: args[0] }),
  setPlaybackVolume: (...args) =>
    invokeCommand(IPC_CHANNELS.playback.setVolume, args, "set_playback_volume", {
      volume: args[0],
    }),
  setPlaybackMuted: (...args) =>
    invokeCommand(IPC_CHANNELS.playback.setMuted, args, "set_playback_muted", { muted: args[0] }),
  selectLibraryDirectory: async () => {
    const selected = await open({ directory: true, multiple: false });
    const result = typeof selected === "string" ? selected : null;
    const response =
      ipcResponseSchemas[IPC_CHANNELS.platform.selectLibraryDirectory].safeParse(result);
    if (!response.success)
      throw new NativeCommandError("ipcProtocolError", "Invalid directory dialog response");
    return response.data;
  },
  getLibraryStatus: () => invokeCommand(IPC_CHANNELS.library.status, [], "get_library_status"),
  listLibraryRoots: () => invokeCommand(IPC_CHANNELS.library.roots, [], "list_library_roots"),
  registerLibraryRoot: (...args) =>
    invokeCommand(IPC_CHANNELS.library.registerRoot, args, "register_library_root", {
      path: args[0],
    }),
  setLibraryRootEnabled: (...args) =>
    invokeCommand(IPC_CHANNELS.library.setRootEnabled, args, "set_library_root_enabled", {
      id: args[0],
      enabled: args[1],
    }),
  removeLibraryRoot: (...args) =>
    invokeCommand(IPC_CHANNELS.library.removeRoot, args, "remove_library_root", { id: args[0] }),
  getLibraryScanState: () => invokeCommand(IPC_CHANNELS.library.scan, [], "get_library_scan_state"),
  startLibraryScan: () => invokeCommand(IPC_CHANNELS.library.startScan, [], "start_library_scan"),
  cancelLibraryScan: () =>
    invokeCommand(IPC_CHANNELS.library.cancelScan, [], "cancel_library_scan"),
  listLibraryTracks: (...args) =>
    invokeCommand(IPC_CHANNELS.library.listTracks, args, "list_library_tracks", {
      cursor: args[0],
      search: args[1],
      sortKey: args[2],
      sortDirection: args[3],
    }),
  listLibraryAlbums: (...args) =>
    invokeCommand(IPC_CHANNELS.library.listAlbums, args, "list_library_albums", {
      cursor: args[0],
      search: args[1],
      sortKey: args[2],
      sortDirection: args[3],
    }),
  listLibraryAlbumArtists: (...args) =>
    invokeCommand(IPC_CHANNELS.library.listAlbumArtists, args, "list_library_album_artists", {
      cursor: args[0],
      search: args[1],
      sortKey: args[2],
      sortDirection: args[3],
    }),
  getLibraryAlbumArtist: (...args) =>
    invokeCommand(IPC_CHANNELS.library.getAlbumArtist, args, "get_library_album_artist", {
      artistKey: args[0],
    }),
  listLibraryArtistAlbums: (...args) =>
    invokeCommand(IPC_CHANNELS.library.listArtistAlbums, args, "list_library_artist_albums", {
      artistKey: args[0],
      cursor: args[1],
      sortKey: args[2],
      sortDirection: args[3],
    }),
  getLibraryAlbumDetails: (...args) =>
    invokeCommand(IPC_CHANNELS.library.getAlbumDetails, args, "get_library_album_details", {
      albumKey: args[0],
    }),
  listLibraryAlbumTracks: (...args) =>
    invokeCommand(IPC_CHANNELS.library.listAlbumTracks, args, "list_library_album_tracks", {
      albumKey: args[0],
      cursor: args[1],
    }),
  getLibraryTrackForPath: (...args) =>
    invokeCommand(IPC_CHANNELS.library.getTrackForPath, args, "get_library_track_for_path", {
      path: args[0],
    }),
  startLibraryTrack: (...args) =>
    invokeCommand(IPC_CHANNELS.playback.startTrack, args, "start_library_track", {
      trackId: args[0],
    }),
  startLibraryAlbum: (...args) =>
    invokeCommand(IPC_CHANNELS.playback.startAlbum, args, "start_library_album", {
      albumKey: args[0],
    }),
  onEvent: (listener) => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("app:event", ({ payload }) => {
      const parsed = ipcEventSchemas["app:event"].safeParse(payload);
      if (parsed.success) listener(parsed.data as AppEvent);
    }).then((stopListening) => {
      if (cancelled) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  },
};

type TestWindow = Window & { __TAURI_TEST_API__?: TNativeAPI };

export function nativeApi(): TNativeAPI {
  const api = getNativeApiOrNull();
  if (api === null) throw new NativeBridgeUnavailableError();
  return api;
}

export function getNativeApiOrNull(): TNativeAPI | null {
  if (typeof window === "undefined") return null;
  const testApi = (window as TestWindow).__TAURI_TEST_API__;
  if (testApi !== undefined) return testApi;
  return isTauri() ? tauriApi : null;
}
