import { ipcMain } from 'electron';
import type { BackendManager } from '../backend/manager';
import { validateSender } from '../security';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireNonNegativeInteger,
	requireString
} from './validation';

export function registerLibraryIpc(manager: BackendManager): void {
	const api = manager.api;
	ipcMain.handle(
		'library:get-status',
		validateSender(() => api.getLibraryStatus())
	);
	ipcMain.handle(
		'library:get-track-for-path',
		validateSender((path: unknown) => api.getLibraryTrackForPath(requireString(path, 'path')))
	);
	ipcMain.handle(
		'library:list-roots',
		validateSender(() => api.listLibraryRoots())
	);
	ipcMain.handle(
		'library:register-root',
		validateSender((path: unknown) => api.registerLibraryRoot(requireString(path, 'path')))
	);
	ipcMain.handle(
		'library:set-root-enabled',
		validateSender((id: unknown, enabled: unknown) =>
			api.setLibraryRootEnabled(requireString(id, 'id'), requireBoolean(enabled, 'enabled'))
		)
	);
	ipcMain.handle(
		'library:remove-root',
		validateSender((id: unknown) => api.removeLibraryRoot(requireString(id, 'id')))
	);
	ipcMain.handle(
		'library:get-scan-state',
		validateSender(() => api.getLibraryScanState())
	);
	ipcMain.handle(
		'library:start-scan',
		validateSender(() => api.startLibraryScan())
	);
	ipcMain.handle(
		'library:cancel-scan',
		validateSender(() => api.cancelLibraryScan())
	);
	ipcMain.handle(
		'library:list-tracks',
		validateSender((afterId: unknown, search: unknown) =>
			api.listLibraryTracks(
				requireNullableString(afterId, 'afterId'),
				requireNullableString(search, 'search')
			)
		)
	);
	ipcMain.handle(
		'library:list-albums',
		validateSender((afterCursor: unknown, search: unknown) =>
			api.listLibraryAlbums(
				requireNullableString(afterCursor, 'afterCursor'),
				requireNullableString(search, 'search')
			)
		)
	);
	ipcMain.handle(
		'library:list-album-artists',
		validateSender((afterCursor: unknown, search: unknown) =>
			api.listLibraryAlbumArtists(
				requireNullableString(afterCursor, 'afterCursor'),
				requireNullableString(search, 'search')
			)
		)
	);
	ipcMain.handle(
		'library:get-album-details',
		validateSender((albumKey: unknown) => api.getLibraryAlbumDetails(requireAlbumKey(albumKey)))
	);
	ipcMain.handle(
		'library:list-album-tracks',
		validateSender((albumKey: unknown, offset: unknown) =>
			api.listLibraryAlbumTracks(
				requireAlbumKey(albumKey),
				requireNonNegativeInteger(offset, 'offset')
			)
		)
	);
	ipcMain.handle(
		'library:start-track',
		validateSender((trackId: unknown) => api.startLibraryTrack(requireString(trackId, 'trackId')))
	);
	ipcMain.handle(
		'library:start-album',
		validateSender((albumKey: unknown) => api.startLibraryAlbum(requireAlbumKey(albumKey)))
	);
}
