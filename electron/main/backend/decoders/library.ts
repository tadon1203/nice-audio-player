import type {
	LibraryAlbumArtistPage,
	LibraryAlbumPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage
} from '../../../../src/lib/api/contracts';
import { decode, isNullableNumber, isNullableString, isRecord } from './shared';

const isArtwork = (value: unknown): boolean => {
	if (value === null) return true;
	return (
		isRecord(value) &&
		typeof value.contentHash === 'string' &&
		(value.mimeType === 'jpeg' || value.mimeType === 'png') &&
		typeof value.relativePath === 'string'
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

const isArtist = (value: unknown): boolean =>
	isRecord(value) &&
	isRecord(value.key) &&
	typeof value.key.name === 'string' &&
	isArtwork(value.artwork) &&
	isNullableNumber(value.albumCount);

export const decodeLibraryRoots = (value: unknown): LibraryRoot[] =>
	decode(
		value,
		(item): item is LibraryRoot[] => Array.isArray(item) && item.every(isRoot),
		'listLibraryRoots'
	);

export const decodeLibraryRoot = (value: unknown): LibraryRoot =>
	decode(value, isRoot, 'libraryRoot');

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
			isNullableString(item.nextCursor),
		'listLibraryAlbumArtists'
	);
