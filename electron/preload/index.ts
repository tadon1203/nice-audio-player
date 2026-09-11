import { contextBridge, ipcRenderer } from 'electron';
import type { NativeAppApi } from '@shared/native-app-api';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		const match = /^\[([^\]]+)\] (.*)$/.exec(message);
		const normalized = new Error(match?.[2] ?? message);
		if (match) Object.defineProperty(normalized, 'code', { value: match[1], enumerable: true });
		throw normalized;
	});
}

const api: NativeAppApi = {
	ping: () => invoke('app:ping'),
	getPlaybackState: () => invoke('playback:get-state'),
	getPlaybackQueue: () => invoke('playback:get-queue'),
	pausePlayback: () => invoke('playback:pause'),
	resumePlayback: () => invoke('playback:resume'),
	previousPlayback: () => invoke('playback:previous'),
	nextPlayback: () => invoke('playback:next'),
	seekPlayback: (positionMs) => invoke('playback:seek', positionMs),
	setPlaybackVolume: (volume) => invoke('playback:set-volume', volume),
	setPlaybackMuted: (muted) => invoke('playback:set-muted', muted),
	listAudioOutputDevices: () => invoke('audio:list-output-devices'),
	selectLibraryDirectory: () => invoke('platform:select-library-directory'),
	getLibraryStatus: () => invoke('library:get-status'),
	listLibraryRoots: () => invoke('library:list-roots'),
	registerLibraryRoot: (path) => invoke('library:register-root', path),
	setLibraryRootEnabled: (id, enabled) => invoke('library:set-root-enabled', id, enabled),
	removeLibraryRoot: (id) => invoke('library:remove-root', id),
	getLibraryScanState: () => invoke('library:get-scan-state'),
	startLibraryScan: () => invoke('library:start-scan'),
	cancelLibraryScan: () => invoke('library:cancel-scan'),
	listLibraryTracks: (afterId, search) => invoke('library:list-tracks', afterId, search),
	listLibraryAlbums: (afterCursor, search) => invoke('library:list-albums', afterCursor, search),
	listLibraryAlbumArtists: (afterCursor, search) =>
		invoke('library:list-album-artists', afterCursor, search),
	getLibraryTrackForPath: (path) => invoke('library:get-track-for-path', path),
	startLibraryTrack: (trackId) => invoke('library:start-track', trackId),
	startLibraryAlbum: (albumKey) => invoke('library:start-album', albumKey),
	onEvent: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) =>
			listener(payload);
		ipcRenderer.on('app:event', handler);
		return () => ipcRenderer.removeListener('app:event', handler);
	}
};
contextBridge.exposeInMainWorld('app', api);
