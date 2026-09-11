import { describe, expect, it } from 'vitest';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireString,
	requireNonNegativeInteger,
	requireUnitInterval
} from '../electron/main/ipc/validation';
import {
	decodeLibraryAlbumArtists,
	decodeLibraryAlbums,
	decodeLibraryScanState
} from '../electron/main/backend/decoders/library';
import { decodeLibraryPlaybackState } from '../electron/main/backend/decoders/playback';

describe('slice boundary contracts', () => {
	it('rejects malformed IPC arguments', () => {
		expect(() => requireString('', 'id')).toThrow();
		expect(() => requireNullableString(1, 'search')).toThrow();
		expect(() => requireBoolean('true', 'enabled')).toThrow();
		expect(() => requireAlbumKey({ title: 'Album' })).toThrow();
		expect(() => requireNonNegativeInteger(-1, 'positionMs')).toThrow();
		expect(() => requireUnitInterval(1.1, 'volume')).toThrow();
	});

	it('rejects malformed catalog and playback responses', () => {
		expect(() => decodeLibraryAlbums({ items: [{ key: {} }], nextCursor: null })).toThrow();
		expect(() => decodeLibraryAlbumArtists({ items: [{ key: {} }], nextCursor: null })).toThrow();
		expect(() => decodeLibraryScanState({ state: 'running' })).toThrow();
		expect(() => decodeLibraryPlaybackState({ status: 'playing', revision: 1 })).toThrow();
	});
});
