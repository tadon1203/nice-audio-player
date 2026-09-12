import type {
	LibraryAlbumArtistPage,
	LibraryAlbumDetails,
	LibraryAlbumPage,
	LibraryAlbumTrackPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackSummary,
	LibraryTrackPage
} from '@shared/native-app-api';
import { decode, isNullableNumber, isNullableString, isRecord } from './shared';

const isArtwork = (value: unknown): boolean => {
	if (value === null) return true;
	const hashPattern = /^[0-9a-f]{64}$/;
	return (
		isRecord(value) &&
		typeof value.contentHash === 'string' &&
		hashPattern.test(value.contentHash) &&
		(value.mimeType === 'jpeg' || value.mimeType === 'png') &&
		typeof value.relativePath === 'string' &&
		new RegExp(
			`^artwork/${value.contentHash.slice(0, 2)}/${value.contentHash}\\.(?:jpg|png)$`
		).test(value.relativePath) &&
		((value.mimeType === 'jpeg' && value.relativePath.endsWith('.jpg')) ||
			(value.mimeType === 'png' && value.relativePath.endsWith('.png')))
	);
};

const isRoot = (value: unknown): value is LibraryRoot =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	typeof value.path === 'string' &&
	typeof value.enabled === 'boolean' &&
	isNullableNumber(value.scanGeneration) &&
	isNullableNumber(value.lastSuccessfulScanAtMs);

const isTrack = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	typeof value.title === 'string' &&
	isNullableString(value.artist) &&
	isNullableString(value.album) &&
	isNullableString(value.albumArtist) &&
	isArtwork(value.artwork) &&
	isNullableNumber(value.durationMs) &&
	(value.availability === 'available' || value.availability === 'missing') &&
	typeof value.playable === 'boolean';

const isAlbum = (value: unknown): boolean =>
	isRecord(value) &&
	isRecord(value.key) &&
	typeof value.key.title === 'string' &&
	typeof value.key.albumArtist === 'string' &&
	isArtwork(value.artwork);

const isAlbumTrack = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	typeof value.title === 'string' &&
	isNullableString(value.artist) &&
	isNullableNumber(value.trackNumber) &&
	isNullableNumber(value.discNumber) &&
	isNullableString(value.fileFormat) &&
	isNullableNumber(value.bitDepth) &&
	isNullableNumber(value.sampleRate) &&
	isNullableNumber(value.durationMs) &&
	(value.availability === 'available' || value.availability === 'missing') &&
	typeof value.playable === 'boolean';

const isArtist = (value: unknown): boolean =>
	isRecord(value) &&
	isRecord(value.key) &&
	typeof value.key.name === 'string' &&
	isArtwork(value.artwork) &&
	isNullableNumber(value.albumCount);

const isLibraryStatus = (value: unknown): value is LibraryStatus =>
	isRecord(value) &&
	(value.status === 'ready' ||
		(value.status === 'unavailable' &&
			[
				'storageUnavailable',
				'databaseOpenFailed',
				'migrationFailed',
				'schemaTooNew',
				'databaseCorrupt'
			].includes(value.reason as string)));

export const decodeLibraryRoots = (value: unknown): LibraryRoot[] =>
	decode(
		value,
		(item): item is LibraryRoot[] => Array.isArray(item) && item.every(isRoot),
		'listLibraryRoots'
	);

export const decodeLibraryRoot = (value: unknown): LibraryRoot =>
	decode(value, isRoot, 'libraryRoot');

export const decodeLibraryStatus = (value: unknown): LibraryStatus =>
	decode(value, isLibraryStatus, 'getLibraryStatus');

export const decodeLibraryTrack = (value: unknown): LibraryTrackSummary | null =>
	decode(
		value,
		(item): item is LibraryTrackSummary | null => item === null || isTrack(item),
		'getLibraryTrackForPath'
	);

export const decodeLibraryScanState = (value: unknown): LibraryScanSnapshot =>
	decode(
		value,
		(item): item is LibraryScanSnapshot =>
			isRecord(item) &&
			(item.state === 'idle' ||
				item.state === 'running' ||
				item.state === 'completed' ||
				item.state === 'cancelled' ||
				item.state === 'failed') &&
			(item.currentRoot === null || isRoot(item.currentRoot)) &&
			isNullableNumber(item.discoveredCount) &&
			isNullableNumber(item.inspectedCount) &&
			isNullableNumber(item.indexedCount) &&
			isNullableNumber(item.failedCount) &&
			isNullableString(item.failureCode),
		'getLibraryScanState'
	);

export const decodeLibraryTracks = (value: unknown): LibraryTrackPage =>
	decode(
		value,
		(item): item is LibraryTrackPage =>
			isRecord(item) &&
			Array.isArray(item.items) &&
			item.items.every(isTrack) &&
			isNullableNumber(item.totalCount) &&
			isNullableString(item.nextAfterId),
		'listLibraryTracks'
	);

export const decodeLibraryAlbums = (value: unknown): LibraryAlbumPage =>
	decode(
		value,
		(item): item is LibraryAlbumPage =>
			isRecord(item) &&
			Array.isArray(item.items) &&
			item.items.every(isAlbum) &&
			isNullableNumber(item.totalCount) &&
			isNullableString(item.nextCursor),
		'listLibraryAlbums'
	);

export const decodeLibraryAlbumArtists = (value: unknown): LibraryAlbumArtistPage =>
	decode(
		value,
		(item): item is LibraryAlbumArtistPage =>
			isRecord(item) &&
			Array.isArray(item.items) &&
			item.items.every(isArtist) &&
			isNullableNumber(item.totalCount) &&
			isNullableString(item.nextCursor),
		'listLibraryAlbumArtists'
	);

export const decodeLibraryAlbumDetails = (value: unknown): LibraryAlbumDetails =>
	decode(
		value,
		(item): item is LibraryAlbumDetails =>
			isRecord(item) &&
			isAlbum(item.summary) &&
			isNullableString(item.date) &&
			isNullableNumber(item.trackCount) &&
			isNullableNumber(item.durationMs) &&
			isNullableString(item.firstPlayableTrackId),
		'getLibraryAlbumDetails'
	);

export const decodeLibraryAlbumTracks = (value: unknown): LibraryAlbumTrackPage =>
	decode(
		value,
		(item): item is LibraryAlbumTrackPage =>
			isRecord(item) &&
			Array.isArray(item.items) &&
			item.items.every(isAlbumTrack) &&
			isNullableNumber(item.nextOffset),
		'listLibraryAlbumTracks'
	);
