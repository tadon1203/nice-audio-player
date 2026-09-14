import { describe, expect, it } from 'vitest';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireString,
	requireNonNegativeInteger,
	requireUnitInterval
} from '../electron/main/ipc/validation';
import { BackendWireMessageSchema } from '../electron/main/backend/schema';

describe('slice boundary contracts', () => {
	it('rejects malformed IPC arguments', () => {
		expect(() => requireString('', 'id')).toThrow();
		expect(() => requireNullableString(1, 'search')).toThrow();
		expect(() => requireBoolean('true', 'enabled')).toThrow();
		expect(() => requireAlbumKey({ title: 'Album' })).toThrow();
		expect(() => requireNonNegativeInteger(-1, 'positionMs')).toThrow();
		expect(() => requireUnitInterval(1.1, 'volume')).toThrow();
	});

	it('rejects malformed catalog and playback frames', () => {
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 1,
					response: {
						method: 'listLibraryAlbums',
						result: { items: [{ key: {} }], totalCount: 1, nextCursor: null }
					}
				}
			}).success
		).toBe(false);
		expect(
			BackendWireMessageSchema.safeParse({
				type: 'response',
				payload: {
					status: 'ok',
					id: 1,
					response: { method: 'getLibraryScanState', result: { state: 'running' } }
				}
			}).success
		).toBe(false);
	});
});
