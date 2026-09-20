import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  ipcEventSchemas,
  ipcRequestSchemas,
  ipcResponseSchemas,
  ipcResultSchema,
} from "../../shared/ipc";
import type { IpcChannel, IpcRequestMap, IpcResponseMap } from "../../shared/ipc";
import type { TElectronAPI } from "../../shared/ipc/preload";

class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

async function invoke<Channel extends IpcChannel>(
  channel: Channel,
  ...args: IpcRequestMap[Channel]
): Promise<IpcResponseMap[Channel]> {
  const request = ipcRequestSchemas[channel].safeParse(args);
  if (!request.success) throw new AppError("invalidArgument", "Invalid IPC arguments");

  let raw: unknown;
  try {
    raw = await ipcRenderer.invoke(channel, ...args);
  } catch {
    throw new AppError("ipcError", "IPC invocation failed");
  }

  const envelope = ipcResultSchema.safeParse(raw);
  if (!envelope.success) throw new AppError("ipcProtocolError", "Invalid IPC result");
  if (!envelope.data.ok) {
    throw new AppError(envelope.data.error.code, envelope.data.error.message);
  }

  const response = ipcResponseSchemas[channel].safeParse(envelope.data.value);
  if (!response.success) throw new AppError("ipcProtocolError", "Invalid IPC response");
  return response.data as IpcResponseMap[Channel];
}

const api: TElectronAPI = {
  getPlaybackState: () => invoke(IPC_CHANNELS.playback.getState),
  getPlaybackQueue: () => invoke(IPC_CHANNELS.playback.getQueue),
  pausePlayback: () => invoke(IPC_CHANNELS.playback.pause),
  resumePlayback: () => invoke(IPC_CHANNELS.playback.resume),
  previousPlayback: () => invoke(IPC_CHANNELS.playback.previous),
  nextPlayback: () => invoke(IPC_CHANNELS.playback.next),
  seekPlayback: (...args) => invoke(IPC_CHANNELS.playback.seek, ...args),
  setPlaybackVolume: (...args) => invoke(IPC_CHANNELS.playback.setVolume, ...args),
  setPlaybackMuted: (...args) => invoke(IPC_CHANNELS.playback.setMuted, ...args),
  selectLibraryDirectory: () => invoke(IPC_CHANNELS.platform.selectLibraryDirectory),
  getLibraryStatus: () => invoke(IPC_CHANNELS.library.status),
  listLibraryRoots: () => invoke(IPC_CHANNELS.library.roots),
  registerLibraryRoot: (...args) => invoke(IPC_CHANNELS.library.registerRoot, ...args),
  setLibraryRootEnabled: (...args) => invoke(IPC_CHANNELS.library.setRootEnabled, ...args),
  removeLibraryRoot: (...args) => invoke(IPC_CHANNELS.library.removeRoot, ...args),
  getLibraryScanState: () => invoke(IPC_CHANNELS.library.scan),
  startLibraryScan: () => invoke(IPC_CHANNELS.library.startScan),
  cancelLibraryScan: () => invoke(IPC_CHANNELS.library.cancelScan),
  listLibraryTracks: (...args) => invoke(IPC_CHANNELS.library.listTracks, ...args),
  listLibraryAlbums: (...args) => invoke(IPC_CHANNELS.library.listAlbums, ...args),
  listLibraryAlbumArtists: (...args) => invoke(IPC_CHANNELS.library.listAlbumArtists, ...args),
  getLibraryAlbumArtist: (...args) => invoke(IPC_CHANNELS.library.getAlbumArtist, ...args),
  listLibraryArtistAlbums: (...args) => invoke(IPC_CHANNELS.library.listArtistAlbums, ...args),
  getLibraryAlbumDetails: (...args) => invoke(IPC_CHANNELS.library.getAlbumDetails, ...args),
  listLibraryAlbumTracks: (...args) => invoke(IPC_CHANNELS.library.listAlbumTracks, ...args),
  getLibraryTrackForPath: (...args) => invoke(IPC_CHANNELS.library.getTrackForPath, ...args),
  startLibraryTrack: (...args) => invoke(IPC_CHANNELS.playback.startTrack, ...args),
  startLibraryAlbum: (...args) => invoke(IPC_CHANNELS.playback.startAlbum, ...args),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      const parsed = ipcEventSchemas["app:event"].safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on("app:event", handler);
    return () => ipcRenderer.removeListener("app:event", handler);
  },
};

contextBridge.exposeInMainWorld("electron", api);
