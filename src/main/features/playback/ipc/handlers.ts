import type { NativeBackend } from "../../../shared/native-backend";
import { IPC_CHANNELS } from "../../../../shared/ipc";
import type { IpcHandlerMap } from "../../../shared/electron";

type PlaybackHandlerMap = Pick<
  IpcHandlerMap,
  (typeof IPC_CHANNELS.playback)[keyof typeof IPC_CHANNELS.playback]
>;

export function createPlaybackHandlers(backend: NativeBackend): PlaybackHandlerMap {
  return {
    [IPC_CHANNELS.playback.getState]: () => backend.getPlaybackState(),
    [IPC_CHANNELS.playback.getQueue]: () => backend.getPlaybackQueue(),
    [IPC_CHANNELS.playback.pause]: () => backend.pausePlayback(),
    [IPC_CHANNELS.playback.resume]: () => backend.resumePlayback(),
    [IPC_CHANNELS.playback.previous]: () => backend.previousPlayback(),
    [IPC_CHANNELS.playback.next]: () => backend.nextPlayback(),
    [IPC_CHANNELS.playback.seek]: (position) => backend.seekPlayback(position),
    [IPC_CHANNELS.playback.setVolume]: (volume) => backend.setPlaybackVolume(volume),
    [IPC_CHANNELS.playback.setMuted]: (muted) => backend.setPlaybackMuted(muted),
    [IPC_CHANNELS.playback.startTrack]: (id) => backend.startLibraryTrack(id),
    [IPC_CHANNELS.playback.startAlbum]: (key) => backend.startLibraryAlbum(key),
  };
}
