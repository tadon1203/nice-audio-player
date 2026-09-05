import { describe, expect, it } from 'vitest';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireString
} from '../electron/main/ipc/validation';
import {
	decodeLibraryAlbumArtists,
	decodeLibraryAlbums,
	decodeLibraryScanState
} from '../electron/main/backend/decoders/library';
import { decodeLibraryPlaybackState } from '../electron/main/backend/decoders/playback';
import { libraryQueryKeys } from '../src/lib/features/library/queries';
import { isTerminalLibraryScan } from '../src/lib/features/library/events';
import { shouldApplyPlaybackSnapshot } from '../src/lib/features/playback/playback-state';

describe('slice boundary contracts', () => {
	it('rejects malformed IPC arguments', () => {
		expect(() => requireString('', 'id')).toThrow();
		expect(() => requireNullableString(1, 'search')).toThrow();
		expect(() => requireBoolean('true', 'enabled')).toThrow();
		expect(() => requireAlbumKey({ title: 'Album' })).toThrow();
	});

	it('uses independent query keys', () => {
		expect(libraryQueryKeys.tracks('a')).not.toEqual(libraryQueryKeys.tracks('b'));
		expect(libraryQueryKeys.albums('a')).not.toEqual(libraryQueryKeys.albumArtists('a'));
	});

	it('recognizes terminal scan states', () => {
		const base = {
			currentRoot: null,
			discoveredCount: null,
			inspectedCount: null,
			indexedCount: null,
			failedCount: null,
			failureCode: null
		};
		expect(isTerminalLibraryScan({ ...base, state: 'completed' })).toBe(true);
		expect(isTerminalLibraryScan({ ...base, state: 'running' })).toBe(false);
	});

	it('keeps playback revision ordering at the mirror boundary', () => {
		const current = { revision: 4 } as Parameters<typeof shouldApplyPlaybackSnapshot>[0];
		const next = { revision: 3 } as Parameters<typeof shouldApplyPlaybackSnapshot>[1];
		expect(shouldApplyPlaybackSnapshot(current, next)).toBe(false);
	});

	it('rejects malformed catalog and playback responses', () => {
		expect(() => decodeLibraryAlbums({ items: [{ key: {} }], nextCursor: null })).toThrow();
		expect(() => decodeLibraryAlbumArtists({ items: [{ key: {} }], nextCursor: null })).toThrow();
		expect(() => decodeLibraryScanState({ state: 'running' })).toThrow();
		expect(() => decodeLibraryPlaybackState({ status: 'playing', revision: 1 })).toThrow();
	});
});
