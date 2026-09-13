import { ipcMain } from 'electron';
import type {
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSortKey,
	LibraryAlbumSortKey,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection,
	LibraryTrackSortKey
} from '@shared/protocol/generated';
import type { BackendManager } from '../backend/manager';
import { validateSender } from '../security';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireNonNegativeInteger,
	requireOneOf,
	requireString
} from './validation';

const SORT_DIRECTIONS = [
	'ascending',
	'descending'
] as const satisfies readonly LibrarySortDirection[];
const TRACK_SORT_KEYS = [
	'title',
	'artist',
	'album',
	'duration'
] as const satisfies readonly LibraryTrackSortKey[];
const ALBUM_SORT_KEYS = [
	'title',
	'artist',
	'year'
] as const satisfies readonly LibraryAlbumSortKey[];
const ARTIST_SORT_KEYS = [
	'artist',
	'albumCount',
	'trackCount'
] as const satisfies readonly LibraryAlbumArtistSortKey[];
const ARTIST_ALBUM_SORT_KEYS = [
	'year',
	'title'
] as const satisfies readonly LibraryArtistAlbumSortKey[];

function requireArtistKey(value: unknown): LibraryAlbumArtistKey {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof (value as { name?: unknown }).name !== 'string'
	)
		throw new TypeError('artistKey must contain a name string');
	return value as LibraryAlbumArtistKey;
}

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
		validateSender((afterId: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
			api.listLibraryTracks(
				requireNullableString(afterId, 'afterId'),
				requireNullableString(search, 'search'),
				requireOneOf(sortKey, 'sortKey', TRACK_SORT_KEYS),
				requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
			)
		)
	);
	ipcMain.handle(
		'library:list-albums',
		validateSender(
			(afterCursor: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
				api.listLibraryAlbums(
					requireNullableString(afterCursor, 'afterCursor'),
					requireNullableString(search, 'search'),
					requireOneOf(sortKey, 'sortKey', ALBUM_SORT_KEYS),
					requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
				)
		)
	);
	ipcMain.handle(
		'library:list-album-artists',
		validateSender(
			(afterCursor: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
				api.listLibraryAlbumArtists(
					requireNullableString(afterCursor, 'afterCursor'),
					requireNullableString(search, 'search'),
					requireOneOf(sortKey, 'sortKey', ARTIST_SORT_KEYS),
					requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
				)
		)
	);
	ipcMain.handle(
		'library:get-album-artist',
		validateSender((artistKey: unknown) => api.getLibraryAlbumArtist(requireArtistKey(artistKey)))
	);
	ipcMain.handle(
		'library:list-artist-albums',
		validateSender(
			(artistKey: unknown, afterCursor: unknown, sortKey: unknown, sortDirection: unknown) =>
				api.listLibraryArtistAlbums(
					requireArtistKey(artistKey),
					requireNullableString(afterCursor, 'afterCursor'),
					requireOneOf(sortKey, 'sortKey', ARTIST_ALBUM_SORT_KEYS),
					requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
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
