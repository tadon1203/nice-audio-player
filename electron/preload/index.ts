import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import type { IpcResult, NativeAppApi } from '@shared/native-app-api';

const ipcResultSchema = z.union([
	z.object({ ok: z.literal(true), value: z.unknown() }).strict(),
	z
		.object({
			ok: z.literal(false),
			error: z.object({ code: z.string(), message: z.string() }).strict()
		})
		.strict()
]);

class NativeIpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'NativeIpcError';
	}
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	let raw: unknown;
	try {
		raw = await ipcRenderer.invoke(channel, ...args);
	} catch {
		throw new NativeIpcError('ipcError', 'IPC invocation failed');
	}
	const parsed = ipcResultSchema.safeParse(raw);
	if (!parsed.success) throw new NativeIpcError('ipcProtocolError', 'Invalid IPC result');
	const result = parsed.data as IpcResult<T>;
	if (!result.ok) throw new NativeIpcError(result.error.code, result.error.message);
	return result.value;
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
	listLibraryTracks: (cursor, search, sortKey, sortDirection) =>
		invoke('library:list-tracks', cursor, search, sortKey, sortDirection),
	listLibraryAlbums: (cursor, search, sortKey, sortDirection) =>
		invoke('library:list-albums', cursor, search, sortKey, sortDirection),
	listLibraryAlbumArtists: (cursor, search, sortKey, sortDirection) =>
		invoke('library:list-album-artists', cursor, search, sortKey, sortDirection),
	getLibraryAlbumArtist: (artistKey) => invoke('library:get-album-artist', artistKey),
	listLibraryArtistAlbums: (artistKey, cursor, sortKey, sortDirection) =>
		invoke('library:list-artist-albums', artistKey, cursor, sortKey, sortDirection),
	getLibraryAlbumDetails: (albumKey) => invoke('library:get-album-details', albumKey),
	listLibraryAlbumTracks: (albumKey, cursor) =>
		invoke('library:list-album-tracks', albumKey, cursor),
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
