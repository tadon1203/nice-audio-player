import { IPC_CHANNELS } from "./channels";
import type { AppEvent, IpcChannel, IpcRequestMap, IpcResponseMap } from "./schemas";

type Invoke<C extends IpcChannel> = (...args: IpcRequestMap[C]) => Promise<IpcResponseMap[C]>;

export type TNativeAPI = {
  getPlaybackState: Invoke<typeof IPC_CHANNELS.playback.getState>;
  getPlaybackQueue: Invoke<typeof IPC_CHANNELS.playback.getQueue>;
  pausePlayback: Invoke<typeof IPC_CHANNELS.playback.pause>;
  resumePlayback: Invoke<typeof IPC_CHANNELS.playback.resume>;
  previousPlayback: Invoke<typeof IPC_CHANNELS.playback.previous>;
  nextPlayback: Invoke<typeof IPC_CHANNELS.playback.next>;
  seekPlayback: Invoke<typeof IPC_CHANNELS.playback.seek>;
  setPlaybackVolume: Invoke<typeof IPC_CHANNELS.playback.setVolume>;
  setPlaybackMuted: Invoke<typeof IPC_CHANNELS.playback.setMuted>;
  selectLibraryDirectory: Invoke<typeof IPC_CHANNELS.platform.selectLibraryDirectory>;
  getLibraryStatus: Invoke<typeof IPC_CHANNELS.library.status>;
  listLibraryRoots: Invoke<typeof IPC_CHANNELS.library.roots>;
  registerLibraryRoot: Invoke<typeof IPC_CHANNELS.library.registerRoot>;
  setLibraryRootEnabled: Invoke<typeof IPC_CHANNELS.library.setRootEnabled>;
  removeLibraryRoot: Invoke<typeof IPC_CHANNELS.library.removeRoot>;
  getLibraryScanState: Invoke<typeof IPC_CHANNELS.library.scan>;
  startLibraryScan: Invoke<typeof IPC_CHANNELS.library.startScan>;
  cancelLibraryScan: Invoke<typeof IPC_CHANNELS.library.cancelScan>;
  listLibraryTracks: Invoke<typeof IPC_CHANNELS.library.listTracks>;
  listLibraryAlbums: Invoke<typeof IPC_CHANNELS.library.listAlbums>;
  listLibraryAlbumArtists: Invoke<typeof IPC_CHANNELS.library.listAlbumArtists>;
  getLibraryAlbumArtist: Invoke<typeof IPC_CHANNELS.library.getAlbumArtist>;
  listLibraryArtistAlbums: Invoke<typeof IPC_CHANNELS.library.listArtistAlbums>;
  getLibraryAlbumDetails: Invoke<typeof IPC_CHANNELS.library.getAlbumDetails>;
  listLibraryAlbumTracks: Invoke<typeof IPC_CHANNELS.library.listAlbumTracks>;
  getLibraryTrackForPath: Invoke<typeof IPC_CHANNELS.library.getTrackForPath>;
  startLibraryTrack: Invoke<typeof IPC_CHANNELS.playback.startTrack>;
  startLibraryAlbum: Invoke<typeof IPC_CHANNELS.playback.startAlbum>;
  onEvent: (listener: (event: AppEvent) => void) => () => void;
};
