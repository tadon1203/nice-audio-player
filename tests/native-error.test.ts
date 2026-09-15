import { describe, expect, it } from 'vitest';
import { readNativeErrorCode } from '../electron/main/native-error';

describe('native error boundary', () => {
	it('prefers the stable native code over the NAPI status code', () => {
		const error = Object.assign(new Error('nativeError:backendClosed'), {
			code: 'GenericFailure'
		});

		expect(readNativeErrorCode(error)).toBe('backendClosed');
	});

	it('falls back to an ordinary error code when no native code is present', () => {
		expect(readNativeErrorCode({ code: 'trackNotFound' })).toBe('trackNotFound');
	});
});
