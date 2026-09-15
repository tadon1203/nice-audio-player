import { describe, expect, it } from 'vitest';
import {
	requireAlbumKey,
	requireBoolean,
	requireNullableString,
	requireString,
	requireNonNegativeInteger,
	requireUnitInterval
} from '../electron/main/ipc/validation';

describe('slice boundary contracts', () => {
	it('rejects malformed IPC arguments', () => {
		expect(() => requireString('', 'id')).toThrow();
		expect(() => requireNullableString(1, 'search')).toThrow();
		expect(() => requireBoolean('true', 'enabled')).toThrow();
		expect(() => requireAlbumKey({ title: 'Album' })).toThrow();
		expect(() => requireNonNegativeInteger(-1, 'positionMs')).toThrow();
		expect(() => requireUnitInterval(1.1, 'volume')).toThrow();
	});
});
