import { ipcMain } from 'electron';
import type {
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSortKey,
	LibraryAlbumSortKey,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection,
	LibraryTrackSortKey
} from '@shared/native-backend';
import type { NativeBackend } from '@shared/native-backend';
import { validateSender } from '../security';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
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

export function registerLibraryIpc(backend: NativeBackend): void {
	ipcMain.handle(
		'library:get-status',
		validateSender(() => backend.getLibraryStatus())
	);
	ipcMain.handle(
		'library:get-track-for-path',
		validateSender((path: unknown) => backend.getLibraryTrackForPath(requireString(path, 'path')))
	);
	ipcMain.handle(
		'library:list-roots',
		validateSender(() => backend.listLibraryRoots())
	);
	ipcMain.handle(
		'library:register-root',
		validateSender((path: unknown) => backend.registerLibraryRoot(requireString(path, 'path')))
	);
	ipcMain.handle(
		'library:set-root-enabled',
		validateSender((id: unknown, enabled: unknown) =>
			backend.setLibraryRootEnabled(requireString(id, 'id'), requireBoolean(enabled, 'enabled'))
		)
	);
	ipcMain.handle(
		'library:remove-root',
		validateSender((id: unknown) => backend.removeLibraryRoot(requireString(id, 'id')))
	);
	ipcMain.handle(
		'library:get-scan-state',
		validateSender(() => backend.getLibraryScanState())
	);
	ipcMain.handle(
		'library:start-scan',
		validateSender(() => backend.startLibraryScan())
	);
	ipcMain.handle(
		'library:cancel-scan',
		validateSender(() => backend.cancelLibraryScan())
	);
	ipcMain.handle(
		'library:list-tracks',
		validateSender((cursor: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
			backend.listLibraryTracks(
				requireNullableString(cursor, 'cursor'),
				requireNullableString(search, 'search'),
				requireOneOf(sortKey, 'sortKey', TRACK_SORT_KEYS),
				requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
			)
		)
	);
	ipcMain.handle(
		'library:list-albums',
		validateSender((cursor: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
			backend.listLibraryAlbums(
				requireNullableString(cursor, 'cursor'),
				requireNullableString(search, 'search'),
				requireOneOf(sortKey, 'sortKey', ALBUM_SORT_KEYS),
				requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
			)
		)
	);
	ipcMain.handle(
		'library:list-album-artists',
		validateSender((cursor: unknown, search: unknown, sortKey: unknown, sortDirection: unknown) =>
			backend.listLibraryAlbumArtists(
				requireNullableString(cursor, 'cursor'),
				requireNullableString(search, 'search'),
				requireOneOf(sortKey, 'sortKey', ARTIST_SORT_KEYS),
				requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
			)
		)
	);
	ipcMain.handle(
		'library:get-album-artist',
		validateSender((artistKey: unknown) =>
			backend.getLibraryAlbumArtist(requireArtistKey(artistKey))
		)
	);
	ipcMain.handle(
		'library:list-artist-albums',
		validateSender(
			(artistKey: unknown, cursor: unknown, sortKey: unknown, sortDirection: unknown) =>
				backend.listLibraryArtistAlbums(
					requireArtistKey(artistKey),
					requireNullableString(cursor, 'cursor'),
					requireOneOf(sortKey, 'sortKey', ARTIST_ALBUM_SORT_KEYS),
					requireOneOf(sortDirection, 'sortDirection', SORT_DIRECTIONS)
				)
		)
	);
	ipcMain.handle(
		'library:get-album-details',
		validateSender((albumKey: unknown) => backend.getLibraryAlbumDetails(requireAlbumKey(albumKey)))
	);
	ipcMain.handle(
		'library:list-album-tracks',
		validateSender((albumKey: unknown, cursor: unknown) =>
			backend.listLibraryAlbumTracks(
				requireAlbumKey(albumKey),
				requireNullableString(cursor, 'cursor')
			)
		)
	);
	ipcMain.handle(
		'library:start-track',
		validateSender((trackId: unknown) =>
			backend.startLibraryTrack(requireString(trackId, 'trackId'))
		)
	);
	ipcMain.handle(
		'library:start-album',
		validateSender((albumKey: unknown) => backend.startLibraryAlbum(requireAlbumKey(albumKey)))
	);
}
